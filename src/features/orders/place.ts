import "server-only";
import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { getProviderById, getProviderForMethod } from "@/lib/payments";
import { Cart } from "@/models/cart";
import { Coupon } from "@/models/coupon";
import { CouponRedemption } from "@/models/coupon-redemption";
import { Order, type OrderDoc, type PaymentMethod } from "@/models/order";
import { prepare, type CheckoutError, type InlineAddress } from "@/features/checkout/prepare";
import { toFils } from "@/features/checkout/money";
import { captureLead } from "@/features/offers/leads";
import { notifyOrder } from "./notify";
import { releaseStock, reserveStock } from "./stock";

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // no look-alike characters
export const newOrderNumber = () => "UAE-" + Array.from(randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join("");

export type PlaceInput = {
  userId?: string; guestId?: string; email?: string; locale: "en" | "ar"; addressId?: string; address?: InlineAddress; buy?: { sku: string; qty: number };
  method: PaymentMethod; couponCode?: string; idempotencyKey: string; expectedTotal?: number; returnBase: string;
};
export type PlaceResult =
  | { ok: true; orderNumber: string; trackToken?: string; guest?: boolean; redirectUrl?: string; duplicate?: boolean; paymentError?: boolean }
  | { ok: false; error: CheckoutError; detail?: string; total?: number };

/**
 * Create an order from the signed-in user's server-side cart. Nothing from the browser is trusted except the
 * selections (address id, method, coupon code, idempotency key); prices, stock and totals are recomputed here.
 *
 * Duplicate-submit safety: the order document is inserted FIRST under a unique (user, idempotencyKey) index, so a
 * repeated or concurrent submission fails on insert before any stock is touched, and returns the existing order.
 */
export async function placeOrder(input: PlaceInput): Promise<PlaceResult> {
  await connectDb();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(input.idempotencyKey)) return { ok: false, error: "invalid" };

  if (!input.userId && !input.guestId) return { ok: false, error: "invalid" };
  const mine = input.userId ? { user: input.userId } : { guest: true, user: { $exists: false } };
  const existing = await Order.findOne({ ...mine, idempotencyKey: input.idempotencyKey }).lean();
  if (existing) return { ok: true, orderNumber: existing.orderNumber, trackToken: existing.trackToken, guest: !!existing.guest, duplicate: true };

  const prep = await prepare({ userId: input.userId, guestId: input.guestId, email: input.email, addressId: input.addressId, address: input.address, buy: input.buy, method: input.method, couponCode: input.couponCode });
  if (!prep.ok) return prep;
  const { p } = prep;
  if (!p.address.recipientName || !p.address.phone || !p.address.area || !p.address.building) return { ok: false, error: "no_address" };
  const guest = !input.userId;
  const trackToken = randomBytes(18).toString("base64url"); // lets anyone holding the link (or order no. + phone) follow the order
  if (input.expectedTotal != null && toFils(input.expectedTotal) !== toFils(p.totals.total)) return { ok: false, error: "total_changed", total: p.totals.total };

  const online = p.method !== "cod";
  const provider = online ? getProviderForMethod(p.method) : null;
  if (online && !provider) return { ok: false, error: "method_unavailable" };
  if (p.method === "tabby" && !input.email?.trim()) return { ok: false, error: "email_required" }; // Tabby needs a contact email

  const t = p.totals;
  const now = new Date();
  const doc: Partial<OrderDoc> & Record<string, unknown> = {
    ...(input.userId ? { user: new Types.ObjectId(input.userId) } : {}), guest, trackToken, source: p.source,
    email: input.email?.trim().toLowerCase() || undefined, locale: input.locale, idempotencyKey: input.idempotencyKey,
    ...(online && guest && p.source === "cart" && input.guestId ? { cartGuestId: input.guestId } : {}),
    status: online ? "pending_payment" : "confirmed",
    items: p.lines.map((l, i) => ({
      productId: new Types.ObjectId(l.productId), sku: l.sku, name: p.meta[i].name, variantLabel: p.meta[i].variantLabel, icon: p.meta[i].icon, image: p.meta[i].image,
      qty: l.qty, unitPrice: l.unitFils / 100, listPrice: l.listFils / 100, lineTotal: l.unitFils * l.qty / 100, couponShare: t.lines[i].couponShareFils / 100,
    })),
    address: {
      recipientName: p.address.recipientName, phone: p.address.phone, emirate: p.address.emirate, area: p.address.area, street: p.address.street,
      building: p.address.building, unit: p.address.unit, landmark: p.address.landmark, instructions: p.address.instructions,
    },
    delivery: { zone: p.zone.key, zoneName: p.zone.name, estimate: p.zone.estimate },
    totals: { listSubtotal: t.listSubtotal, itemDiscounts: t.itemDiscounts, subtotal: t.subtotal, couponDiscount: t.couponDiscount, offerDiscount: t.offerDiscount, deliveryFee: t.deliveryFee, codFee: t.codFee, tax: t.tax, taxIncluded: t.taxIncluded, total: t.total, currency: "AED" },
    coupon: p.coupon ? { code: p.coupon.rule.code, discount: t.couponDiscount } : undefined,
    offer: t.offer && t.offer.kind !== "coupon" ? { kind: t.offer.kind, percent: t.offer.percent, discount: t.offerDiscount } : undefined,
    payment: { method: p.method, status: online ? "pending" : "cod_pending", provider: provider?.id, amount: t.total },
    expiresAt: online ? new Date(now.getTime() + p.settings.pendingPaymentMinutes * 60_000) : undefined,
    timeline: [{ status: online ? "pending_payment" : "confirmed", at: now, by: "customer", note: online ? "Order placed, awaiting payment" : "Order placed (cash on delivery)" }],
  };

  let order;
  for (let attempt = 0; ; attempt++) {
    try {
      order = await Order.create({ ...doc, orderNumber: newOrderNumber() });
      break;
    } catch (e) {
      const err = e as { code?: number; keyPattern?: Record<string, number> };
      if (err.code === 11000 && err.keyPattern?.idempotencyKey) { // concurrent duplicate submit
        const dup = await Order.findOne({ ...mine, idempotencyKey: input.idempotencyKey }).lean();
        if (dup) return { ok: true, orderNumber: dup.orderNumber, trackToken: dup.trackToken, guest: !!dup.guest, duplicate: true };
      }
      if (err.code === 11000 && attempt < 5) continue; // order-number collision: pick another
      throw e;
    }
  }

  // Take stock. On failure nothing was sold: remove the never-exposed order and report which item ran out.
  const reserved = await reserveStock(order._id, order.items);
  if (!reserved.ok) {
    await Order.deleteOne({ _id: order._id });
    return { ok: false, error: "out_of_stock", detail: reserved.sku };
  }

  // Claim the coupon use atomically (usage limit) and record the per-customer redemption.
  if (p.coupon) {
    const c = p.coupon.doc;
    const claimed = await Coupon.updateOne(
      { _id: c._id, active: true, ...(c.usageLimit != null ? { usedCount: { $lt: c.usageLimit } } : {}) },
      { $inc: { usedCount: 1 } },
    );
    let ok = claimed.modifiedCount > 0;
    if (ok) {
      await CouponRedemption.create({ coupon: c._id, ...(input.userId ? { user: input.userId } : { phone: p.address.phone }), order: order._id, amount: t.couponDiscount });
      const used = await CouponRedemption.countDocuments({ coupon: c._id, ...(input.userId ? { user: input.userId } : { phone: p.address.phone }) });
      if (used > (c.perCustomerLimit ?? 1)) { // lost a race against our own parallel order
        await CouponRedemption.deleteOne({ order: order._id }); await Coupon.updateOne({ _id: c._id }, { $inc: { usedCount: -1 } }); ok = false;
      }
    }
    if (!ok) {
      await releaseStock(order._id, "order_cancelled");
      await Order.deleteOne({ _id: order._id });
      return { ok: false, error: "coupon_used_up" };
    }
  }

  // Remember the contact for the merchant's customer list (no marketing consent is implied by ordering).
  captureLead({ email: input.email, phone: p.address.phone, name: p.address.recipientName, source: "checkout", locale: input.locale, consent: false }).catch(() => {});
  // Online payment: keep the cart until the payment actually succeeds (payment-events empties it), so abandoning the payment page loses nothing.
  if (p.source === "cart" && !online) await Cart.updateOne(input.userId ? { user: input.userId } : { guestId: input.guestId }, { $set: { items: [] } });

  if (!online) {
    await notifyOrder(order, "confirmation");
    return { ok: true, orderNumber: order.orderNumber, trackToken, guest };
  }
  const paid = await startPaymentFor(order.orderNumber, input.returnBase, input.userId);
  return paid.ok ? { ...paid, trackToken, guest } : paid;
}

/** Create (or recreate) the hosted payment session for an unpaid order. The customer is then redirected. */
export async function startPaymentFor(orderNumber: string, returnBase: string, userId?: string): Promise<PlaceResult> {
  await connectDb();
  const order = await Order.findOne({ orderNumber, ...(userId ? { user: userId } : {}) });
  if (!order) return { ok: false, error: "invalid" };
  if (order.status !== "pending_payment" || order.payment.method === "cod") return { ok: true, orderNumber };
  if (order.expiresAt && order.expiresAt < new Date()) return { ok: false, error: "invalid" };
  const provider = getProviderById(order.payment.provider) ?? getProviderForMethod(order.payment.method);
  if (!provider) return { ok: true, orderNumber, paymentError: true };
  const a = order.address;
  const buyer = {
    name: a.recipientName, phone: a.phone, email: order.email ?? undefined, city: a.emirate, lang: order.locale,
    address: [a.unit, a.building, a.street, a.area].filter(Boolean).join(", "),
    items: order.items.map((i) => ({ title: i.name.en, quantity: i.qty, unitPrice: i.lineTotal / i.qty, category: "General" })),
  };
  try {
    const res = await provider.createPayment({
      orderNumber, amount: order.totals.total ?? 0, currency: "AED", method: order.payment.method, email: order.email ?? undefined, buyer,
      returnUrl: order.guest ? `${returnBase}/${order.locale}/track/${orderNumber}?k=${order.trackToken}` : `${returnBase}/${order.locale}/account/orders/${orderNumber}`,
    });
    await Order.updateOne({ _id: order._id }, { $set: { "payment.providerRef": res.providerRef, "payment.provider": provider.id, "payment.status": "pending" } });
    return { ok: true, orderNumber, redirectUrl: res.redirectUrl };
  } catch (e) {
    console.error("[payments] createPayment failed:", (e as Error).message);
    return { ok: true, orderNumber, paymentError: true }; // order exists; customer can retry from the order page
  }
}
