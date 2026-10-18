import "server-only";
import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { getMailer } from "@/lib/mailer";
import { Coupon } from "@/models/coupon";
import { InventoryMovement } from "@/models/inventory-movement";
import { Order, type OrderDoc } from "@/models/order";
import { Product } from "@/models/product";
import { RETURN_REASONS, ReturnRequest, type ReturnDoc, type ReturnReason, type ReturnResolution, type ReturnStatus } from "@/models/return-request";
import { getSettings } from "@/features/checkout/prepare";
import { give, take } from "@/features/orders/stock";

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const code = (prefix: string, n = 8) => prefix + Array.from(randomBytes(n), (b) => ALPHABET[b % ALPHABET.length]).join("");
const round2 = (n: number) => Math.round(n * 100) / 100;

export type ReturnError = "not_found" | "not_delivered" | "window_closed" | "invalid_items" | "invalid_exchange" | "exchange_unavailable" | "invalid_state" | "out_of_stock";

export const deliveredAt = (o: Pick<OrderDoc, "status" | "timeline">): Date | null => {
  const e = [...o.timeline].reverse().find((x) => x.status === "delivered");
  return e ? new Date(e.at) : null;
};

/** Is this order inside its free-return window right now? (Delivered, and within `returnWindowDays` of delivery.) */
export function returnWindow(o: Pick<OrderDoc, "status" | "timeline">, days: number, now = new Date()): { open: boolean; reason?: "not_delivered" | "window_closed"; until?: Date } {
  if (o.status !== "delivered") return { open: false, reason: "not_delivered" };
  const at = deliveredAt(o);
  if (!at) return { open: false, reason: "not_delivered" };
  const until = new Date(at.getTime() + days * 86_400_000);
  return now <= until ? { open: true, until } : { open: false, reason: "window_closed", until };
}

/** What's the customer still allowed to return, per SKU (ordered qty minus quantities in active requests)? */
export async function returnableQty(order: OrderDoc & { _id: Types.ObjectId }) {
  const active = await ReturnRequest.find({ order: order._id, status: { $nin: ["rejected", "cancelled"] } }).lean();
  const used = new Map<string, number>();
  for (const r of active) for (const i of r.items) used.set(i.sku, (used.get(i.sku) ?? 0) + i.qty);
  return new Map(order.items.map((i) => [i.sku, Math.max(0, i.qty - (used.get(i.sku) ?? 0))]));
}

/** The money value of returning `qty` of an order line: what was actually paid for it (after its coupon/offer share). */
const lineValue = (i: OrderDoc["items"][number], qty: number) => round2(((i.lineTotal - (i.couponShare ?? 0)) * qty) / i.qty);

export type CreateReturnInput = {
  order: OrderDoc & { _id: Types.ObjectId };
  items: { sku: string; qty: number; exchangeSku?: string }[];
  resolution: ReturnResolution; reason: ReturnReason; note?: string; actor?: string;
};

export async function createReturn(input: CreateReturnInput): Promise<{ ok: true; number: string } | { ok: false; error: ReturnError }> {
  await connectDb();
  const settings = await getSettings();
  const w = returnWindow(input.order, settings.returnWindowDays ?? 7);
  if (!w.open) return { ok: false, error: w.reason! };
  if (!RETURN_REASONS.includes(input.reason) || !input.items.length) return { ok: false, error: "invalid_items" };

  const left = await returnableQty(input.order);
  const lines: ReturnDoc["items"] = [];
  const seen = new Set<string>();
  for (const it of input.items) {
    const line = input.order.items.find((x) => x.sku === it.sku);
    if (!line || seen.has(it.sku) || !Number.isInteger(it.qty) || it.qty < 1 || it.qty > (left.get(it.sku) ?? 0)) return { ok: false, error: "invalid_items" };
    seen.add(it.sku);
    let exchangeSku: string | undefined; let exchangeLabel: { en: string; ar: string } | undefined;
    if (input.resolution === "exchange") {
      // An exchange swaps to another variant (size/colour) of the SAME product.
      const p = await Product.findOne({ _id: line.productId, "variants.sku": it.exchangeSku }).lean();
      const v = p?.variants.find((x) => x.sku === it.exchangeSku);
      if (!p || !v || v.sku === it.sku) return { ok: false, error: "invalid_exchange" };
      if (v.stock < it.qty) return { ok: false, error: "exchange_unavailable" };
      exchangeSku = v.sku; exchangeLabel = { en: v.label?.en ?? "", ar: v.label?.ar ?? "" };
    }
    lines.push({ sku: line.sku, productId: line.productId, name: line.name, variantLabel: line.variantLabel, qty: it.qty, value: lineValue(line, it.qty), exchangeSku, exchangeLabel });
  }

  const now = new Date();
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await ReturnRequest.create({
        number: code("RET-", 6), order: input.order._id, orderNumber: input.order.orderNumber, user: input.order.user ?? undefined,
        contact: { name: input.order.address.recipientName, phone: input.order.address.phone, email: input.order.email ?? undefined, locale: input.order.locale },
        resolution: input.resolution, reason: input.reason, note: input.note?.slice(0, 500) || undefined, items: lines, status: "requested",
        timeline: [{ status: "requested", at: now, by: input.actor ?? "customer", note: input.note?.slice(0, 200) || undefined }],
      });
      return { ok: true, number: r.number };
    } catch (e) {
      if ((e as { code?: number }).code === 11000 && attempt < 5) continue; // number collision
      throw e;
    }
  }
}

async function notify(r: ReturnDoc, text: { en: string; ar: string }) {
  try {
    const l = r.contact.locale ?? "en";
    if (r.contact.email) await getMailer().send({ to: r.contact.email, subject: `${l === "ar" ? "طلب الإرجاع" : "Return"} ${r.number}`, text: text[l] });
    if (process.env.NODE_ENV !== "production" && r.contact.phone) console.info(`[sms:dev — NOT SENT] ${r.contact.phone}: ${text[l]}`);
  } catch (e) { console.warn("[returns] notify failed:", (e as Error).message); }
}

const push = (status: ReturnStatus, actor: string, note?: string) => ({ status, at: new Date(), by: actor, note });

/** Staff transitions. Each is conditional on the current status, so two staff members can't both apply one. */
export async function reviewReturn(id: string, to: "approved" | "rejected", actor: string, note?: string): Promise<{ ok: true } | { ok: false; error: ReturnError }> {
  await connectDb();
  const r = await ReturnRequest.findOneAndUpdate({ _id: id, status: "requested" }, { $set: { status: to, ...(note ? { staffNote: note } : {}) }, $push: { timeline: push(to, actor, note) } }, { returnDocument: "after" }).lean();
  if (!r) return { ok: false, error: "invalid_state" };
  await notify(r, to === "approved"
    ? { en: `Your return ${r.number} was approved. Please hand the items back to our courier or contact support to arrange pickup — it's free.`, ar: `تمت الموافقة على طلب الإرجاع ${r.number}. يرجى تسليم المنتجات لمندوبنا أو التواصل مع الدعم لترتيب الاستلام — مجاناً.` }
    : { en: `Your return ${r.number} couldn't be approved.${note ? ` Reason: ${note}` : ""}`, ar: `تعذّرت الموافقة على طلب الإرجاع ${r.number}.${note ? ` السبب: ${note}` : ""}` });
  return { ok: true };
}

/** Items physically came back. Optionally put them back on the shelf (not if damaged). */
export async function receiveReturn(id: string, actor: string, restock: boolean, note?: string): Promise<{ ok: true } | { ok: false; error: ReturnError }> {
  await connectDb();
  const r = await ReturnRequest.findOneAndUpdate({ _id: id, status: "approved" }, { $set: { status: "received", restocked: restock }, $push: { timeline: push("received", actor, note) } }, { returnDocument: "before" }).lean();
  if (!r) return { ok: false, error: "invalid_state" };
  if (restock) {
    for (const i of r.items) await give(i.sku, i.qty);
    await InventoryMovement.insertMany(r.items.map((i) => ({ product: i.productId, sku: i.sku, delta: i.qty, reason: "return_restock", order: r.order, actor: Types.ObjectId.isValid(actor) ? actor : undefined, note: r.number })));
  }
  return { ok: true };
}

/**
 * Close the return. Credit → issue a single-use store-credit coupon worth the returned value (valid 90 days).
 * Exchange → take the replacement from stock (fails cleanly if it just sold out).
 */
export async function completeReturn(id: string, actor: string, note?: string): Promise<{ ok: true; creditCode?: string; creditAmount?: number } | { ok: false; error: ReturnError }> {
  await connectDb();
  const claimed = await ReturnRequest.findOneAndUpdate({ _id: id, status: "received" }, { $set: { status: "completed" }, $push: { timeline: push("completed", actor, note) } }, { returnDocument: "before" }).lean();
  if (!claimed) return { ok: false, error: "invalid_state" };
  const undo = () => ReturnRequest.updateOne({ _id: id }, { $set: { status: "received" }, $pop: { timeline: 1 } });

  if (claimed.resolution === "exchange") {
    const taken: { sku: string; qty: number; productId?: Types.ObjectId }[] = [];
    for (const i of claimed.items) {
      if (i.exchangeSku && await take(i.exchangeSku, i.qty)) taken.push({ sku: i.exchangeSku, qty: i.qty, productId: i.productId });
      else { for (const t of taken) await give(t.sku, t.qty); await undo(); return { ok: false, error: "out_of_stock" }; }
    }
    await InventoryMovement.insertMany(taken.map((t) => ({ product: t.productId, sku: t.sku, delta: -t.qty, reason: "exchange_dispatched", order: claimed.order, actor: Types.ObjectId.isValid(actor) ? actor : undefined, note: claimed.number })));
    await notify(claimed, { en: `Your exchange for return ${claimed.number} is on its way — free of charge.`, ar: `استبدالك للطلب ${claimed.number} في الطريق إليك — مجاناً.` });
    return { ok: true };
  }

  const amount = round2(claimed.items.reduce((a, i) => a + i.value, 0));
  const creditCode = code("CR-", 8);
  await Coupon.create({
    code: creditCode, type: "fixed", value: amount, minSubtotal: 0, active: true, public: false, usageLimit: 1, perCustomerLimit: 1, stackWithSale: true,
    endsAt: new Date(Date.now() + 90 * 86_400_000), description: { en: `Store credit for return ${claimed.number}`, ar: `رصيد متجر للإرجاع ${claimed.number}` },
  });
  await ReturnRequest.updateOne({ _id: id }, { $set: { creditAmount: amount, creditCode } });
  await notify(claimed, {
    en: `Your return ${claimed.number} is complete. Your store credit: code ${creditCode} — AED ${amount.toFixed(2)} off your next order, valid for 90 days.`,
    ar: `اكتمل طلب الإرجاع ${claimed.number}. رصيدك في المتجر: الكود ${creditCode} — خصم ${amount.toFixed(2)} د.إ على طلبك القادم، صالح لمدة 90 يوماً.`,
  });
  return { ok: true, creditCode, creditAmount: amount };
}

export async function listReturnsForOrder(orderId: Types.ObjectId) {
  await connectDb();
  const rows = await ReturnRequest.find({ order: orderId }).sort({ createdAt: -1 }).lean();
  return rows.map((r) => JSON.parse(JSON.stringify({ ...r, id: String(r._id), _id: undefined, order: undefined, user: undefined })) as Omit<ReturnDoc, "_id" | "order" | "user"> & { id: string });
}
export type ReturnView = Awaited<ReturnType<typeof listReturnsForOrder>>[number];

/** Does the customer already hold a cancelled-able request? (Customers can withdraw before approval.) */
export async function cancelReturn(id: string, orderId: Types.ObjectId): Promise<boolean> {
  await connectDb();
  const r = await ReturnRequest.findOneAndUpdate({ _id: id, order: orderId, status: "requested" }, { $set: { status: "cancelled" }, $push: { timeline: push("cancelled", "customer") } });
  return !!r;
}

export const orderForReturns = async (orderNumber: string) => {
  await connectDb();
  return (await Order.findOne({ orderNumber }).lean()) as (OrderDoc & { _id: Types.ObjectId }) | null;
};
