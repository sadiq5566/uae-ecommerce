import "server-only";
import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { Coupon } from "@/models/coupon";
import { CouponRedemption } from "@/models/coupon-redemption";
import { Order, type OrderDoc, type OrderStatus, type PaymentStatus } from "@/models/order";
import { notifyOrder } from "./notify";
import { restoreOrderCredit } from "@/features/credit/service";
import { releaseStock } from "./stock";
import { canTransition, isPaid } from "./status";

export type TransitionResult = { ok: true; order: OrderDoc & { _id: Types.ObjectId } } | { ok: false; error: "not_found" | "invalid_transition" | "not_paid" | "payment_required" | "conflict" };

/**
 * Move an order through its lifecycle. Callers (admin UI, webhooks, expiry job) must already be authorised.
 * The update is conditional on the current status, so concurrent changes can't both win.
 */
export async function updateOrderStatus(input: { orderNumber: string; to: OrderStatus; actor: string; note?: string; notify?: boolean }): Promise<TransitionResult> {
  await connectDb();
  const cur = await Order.findOne({ orderNumber: input.orderNumber }).lean();
  if (!cur) return { ok: false, error: "not_found" };
  const check = canTransition(cur.status, input.to, cur.payment.status);
  if (!check.ok) return { ok: false, error: check.reason as "invalid_transition" | "not_paid" | "payment_required" };

  const set: Record<string, unknown> = { status: input.to };
  let paymentStatus: PaymentStatus | undefined;
  if (input.to === "delivered" && cur.payment.method === "cod") { paymentStatus = "cod_collected"; set["payment.paidAt"] = new Date(); } // cash is collected on delivery
  if (input.to === "cancelled" && isPaid(cur.payment.status)) paymentStatus = cur.payment.method === "credit" ? "refunded" : "refund_pending"; // money taken → needs a refund (web credit goes straight back to the wallet)
  if (input.to === "refund_pending") paymentStatus = "refund_pending";
  if (input.to === "refunded") paymentStatus = "refunded";
  if (paymentStatus) set["payment.status"] = paymentStatus;
  if (input.to === "cancelled") set.expiresAt = null;

  const updated = await Order.findOneAndUpdate(
    { _id: cur._id, status: cur.status },
    { $set: set, $push: { timeline: { status: input.to, at: new Date(), by: input.actor, note: input.note } } },
    { returnDocument: "after" },
  ).lean();
  if (!updated) return { ok: false, error: "conflict" };

  if (input.to === "cancelled") {
    await releaseStock(cur._id, input.actor === "system" ? "order_expired" : "order_cancelled", input.actor);
    const red = await CouponRedemption.findOneAndDelete({ order: cur._id });
    await restoreOrderCredit(cur._id); // web credit spent on the order goes back to the customer
    if (red) await Coupon.updateOne({ _id: red.coupon, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }); // coupon use is given back
  }
  if (input.notify !== false && input.to !== "pending_payment") await notifyOrder(updated, "status");
  return { ok: true, order: updated as OrderDoc & { _id: Types.ObjectId } };
}

/** Cancel unpaid online-payment orders whose payment window has passed and release their stock. */
export async function expirePendingOrders(now = new Date(), limit = 100) {
  await connectDb();
  const due = await Order.find({ status: "pending_payment", expiresAt: { $lt: now }, "payment.status": { $in: ["pending", "failed"] } }).limit(limit).select("orderNumber").lean();
  let cancelled = 0;
  for (const o of due) {
    const r = await updateOrderStatus({ orderNumber: o.orderNumber, to: "cancelled", actor: "system", note: "Payment window expired", notify: false });
    if (r.ok) cancelled++;
  }
  return { checked: due.length, cancelled };
}
