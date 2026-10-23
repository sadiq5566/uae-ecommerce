import "server-only";
import { cache } from "react";
import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { getProviders } from "@/lib/payments";
import { Address } from "@/models/address";
import { Cart } from "@/models/cart";
import { Coupon, type CouponDoc } from "@/models/coupon";
import { CouponRedemption } from "@/models/coupon-redemption";
import { DeliveryZone } from "@/models/delivery-zone";
import { Product } from "@/models/product";
import { baseName } from "@/lib/variant-name";
import { Settings } from "@/models/settings";
import type { PaymentMethod } from "@/models/order";
import { toFils } from "./money";
import { Order } from "@/models/order";
import { computeTotals, type AutoOffer, type CouponRule, type PriceLine, type Rules, type Totals, type Zone } from "./pricing";
import { toRow } from "@/features/catalog/row";

type L10n = { en: string; ar: string };

export type CheckoutError =
  | "empty_cart" | "cart_issues" | "no_address" | "below_minimum" | "method_unavailable" | "cod_limit"
  | "email_required" | "coupon_invalid" | "coupon_expired" | "coupon_used_up" | "coupon_customer_limit" | "coupon_min_subtotal" | "coupon_not_eligible"
  | "no_zone" | "total_changed" | "out_of_stock" | "invalid";

export type LineMeta = { sku: string; productId: string; name: L10n; variantLabel?: L10n; icon: string; image?: string };
export type InlineAddress = { recipientName: string; phone: string; emirate: string; area: string; street?: string | null; building: string; unit?: string | null; landmark?: string | null; instructions?: string | null };
/** Who is buying: a signed-in user, or a guest identified by their cookie id and the phone they typed. */
export type Buyer = { userId?: string; guestId?: string; email?: string };
export type Prepared = {
  buyer: Buyer; userId?: string; method: PaymentMethod; source: "cart" | "buy_now"; firstOrder: boolean;
  address: { id?: string; recipientName: string; phone: string; emirate: string; area: string; street?: string; building: string; unit?: string; landmark?: string; instructions?: string };
  zone: { key: string; name: L10n; estimate: L10n; rule: Zone };
  rules: Rules; settings: { codEnabled: boolean; codMaxOrder: number; pendingPaymentMinutes: number };
  lines: PriceLine[]; meta: LineMeta[]; coupon: { doc: CouponDoc & { _id: Types.ObjectId }; rule: CouponRule } | null;
  totals: Totals;
};

export const getSettings = cache(async () => {
  await connectDb();
  const s = await Settings.findOneAndUpdate({ key: "store" }, { $setOnInsert: { key: "store" } }, { upsert: true, returnDocument: "after" }).lean();
  return s!;
});

/** Payment methods currently offered. COD from settings; online methods only if a provider really supports them. */
export async function availableMethods(): Promise<PaymentMethod[]> {
  const s = await getSettings();
  const out: PaymentMethod[] = [];
  if (s.codEnabled) out.push("cod"); // cash on delivery first (default), online methods after
  for (const p of getProviders()) out.push(...p.methods); // card (Stripe) first, then Tabby
  return out;
}

type ProductRow = {
  _id: Types.ObjectId; slug: string; sku: string; name: L10n; icon: string; category: Types.ObjectId; images?: { url: string }[];
  price: number; finalPrice: number; stock: number; variants?: { sku: string; label: L10n; stock: number; price?: number; image?: string }[];
};

/** A customer's first order = no earlier order (other than cancelled ones) under their account, phone or email. */
export async function isFirstOrder(who: { userId?: string; phone?: string; email?: string }): Promise<boolean> {
  await connectDb();
  const or: Record<string, unknown>[] = [];
  if (who.userId) or.push({ user: who.userId });
  if (who.phone) or.push({ "address.phone": who.phone });
  if (who.email) or.push({ email: who.email.toLowerCase() });
  if (!or.length) return true;
  return !(await Order.exists({ status: { $ne: "cancelled" }, $or: or }));
}

export function autoOffersOf(s: Awaited<ReturnType<typeof getSettings>>, firstOrder: boolean): AutoOffer[] {
  const out: AutoOffer[] = []; const o = s.offers;
  if (o?.tier?.enabled && o.tier.percent > 0) out.push({ kind: "tier", percent: o.tier.percent, minSubtotalFils: toFils(o.tier.minSubtotal), maxDiscountFils: o.tier.maxDiscount != null ? toFils(o.tier.maxDiscount) : undefined });
  if (firstOrder && o?.firstOrder?.enabled && o.firstOrder.percent > 0) out.push({ kind: "first_order", percent: o.firstOrder.percent, maxDiscountFils: o.firstOrder.maxDiscount != null ? toFils(o.firstOrder.maxDiscount) : undefined });
  return out;
}

export async function validateCoupon(code: string, who: { userId?: string; phone?: string } | string, now = new Date()): Promise<{ doc: CouponDoc & { _id: Types.ObjectId } } | { error: CheckoutError }> {
  if (typeof who === "string") who = { userId: who };
  await connectDb();
  const doc = (await Coupon.findOne({ code: code.trim().toUpperCase() }).lean()) as (CouponDoc & { _id: Types.ObjectId }) | null;
  if (!doc || !doc.active) return { error: "coupon_invalid" };
  if ((doc.startsAt && doc.startsAt > now) || (doc.endsAt && doc.endsAt < now)) return { error: "coupon_expired" };
  if (doc.usageLimit != null && doc.usedCount >= doc.usageLimit) return { error: "coupon_used_up" };
  const used = who.userId ? await CouponRedemption.countDocuments({ coupon: doc._id, user: who.userId })
    : who.phone ? await CouponRedemption.countDocuments({ coupon: doc._id, phone: who.phone }) : 0;
  if (used >= (doc.perCustomerLimit ?? 1)) return { error: "coupon_customer_limit" };
  return { doc };
}

const ids = (a?: Types.ObjectId[]) => (a ?? []).map(String);
export const ruleOf = (d: CouponDoc): CouponRule => ({
  code: d.code, type: d.type, value: d.value, maxDiscountFils: d.maxDiscount != null ? toFils(d.maxDiscount) : undefined,
  minSubtotalFils: d.minSubtotal ? toFils(d.minSubtotal) : undefined,
  products: ids(d.products), categories: ids(d.categories), excludeProducts: ids(d.excludeProducts), excludeCategories: ids(d.excludeCategories),
  stackWithSale: d.stackWithSale,
});

/**
 * Load everything the browser must never be trusted with — cart contents, prices, stock, address, zone, rules, coupon —
 * and compute the totals. Shared by the quote shown on the checkout page and by order placement.
 */
export type PrepareInput = {
  userId?: string; guestId?: string; email?: string; phone?: string; addressId?: string; address?: InlineAddress; emirate?: string;
  buy?: { sku: string; qty: number }; method: PaymentMethod; couponCode?: string;
};
export async function prepare(input: PrepareInput): Promise<{ ok: true; p: Prepared } | { ok: false; error: CheckoutError; detail?: string }> {
  await connectDb();
  const { userId, method } = input;
  if (!userId && !input.guestId) return { ok: false, error: "invalid" };
  const settings = await getSettings();
  if (!(await availableMethods()).includes(method)) return { ok: false, error: "method_unavailable" };

  // "Buy now" checks out one item on its own; the cart is left untouched.
  const cartItems: { sku: string; qty: number }[] = input.buy
    ? [{ sku: String(input.buy.sku), qty: Math.max(1, Math.min(10, Math.floor(Number(input.buy.qty)) || 1)) }]
    : ((await Cart.findOne(userId ? { user: userId } : { guestId: input.guestId }).lean())?.items ?? []);
  if (!cartItems.length) return { ok: false, error: "empty_cart" };
  const skus = cartItems.map((i) => i.sku);
  const rows = ((await Product.find({ status: "active", mergedInto: null, $or: [{ sku: { $in: skus } }, { "variants.sku": { $in: skus } }] }).lean()) as unknown as Record<string, unknown>[]).map(toRow) as unknown as ProductRow[];
  const found = new Map<string, { p: ProductRow; v?: NonNullable<ProductRow["variants"]>[number] }>();
  for (const p of rows) { if (p.variants?.length) p.variants.forEach((v) => found.set(v.sku, { p, v })); else found.set(p.sku, { p }); }

  const lines: PriceLine[] = []; const meta: LineMeta[] = [];
  for (const it of cartItems) {
    const hit = found.get(it.sku);
    const stock = hit ? (hit.v ? hit.v.stock : hit.p.stock) : 0;
    if (!hit || stock < it.qty) return { ok: false, error: "cart_issues", detail: it.sku }; // never silently change what they pay for
    const unit = hit.v?.price ?? hit.p.finalPrice;
    lines.push({ sku: it.sku, productId: String(hit.p._id), categoryId: String(hit.p.category), qty: it.qty, unitFils: toFils(unit), listFils: toFils(Math.max(hit.p.price, unit)) });
    meta.push({ sku: it.sku, productId: String(hit.p._id), name: { en: baseName(hit.p.name.en, (hit.p.variants ?? []).map((x) => x.label.en)), ar: baseName(hit.p.name.ar, (hit.p.variants ?? []).map((x) => x.label.ar)) }, variantLabel: hit.v?.label, icon: hit.p.icon, image: hit.v?.image || hit.p.images?.[0]?.url });
  }

  let addr: (InlineAddress & { _id?: Types.ObjectId }) | null = null;
  if (input.address) addr = input.address; // typed in at checkout (guests, or members using a one-off address)
  else if (userId && input.addressId && Types.ObjectId.isValid(input.addressId)) {
    addr = await Address.findOne({ _id: input.addressId, user: userId }).lean(); // ownership enforced in the query
  }
  // A quote can be priced with just the emirate (guest hasn't finished typing the address yet).
  const emirate = addr?.emirate ?? input.emirate;
  if (!emirate) return { ok: false, error: "no_address" };
  const zoneDoc = await DeliveryZone.findOne({ active: true, emirates: emirate }).lean();
  if (!zoneDoc) return { ok: false, error: "no_zone" };

  let coupon: Prepared["coupon"] = null;
  if (input.couponCode?.trim()) {
    const v = await validateCoupon(input.couponCode, { userId, phone: addr?.phone ?? input.phone });
    if ("error" in v) return { ok: false, error: v.error };
    coupon = { doc: v.doc, rule: ruleOf(v.doc) };
  }

  const rules: Rules = {
    minOrderFils: toFils(settings.minOrder), freeThresholdFils: toFils(settings.freeDeliveryThreshold), codFeeFils: toFils(settings.codFee),
    tax: { enabled: settings.tax.enabled, rate: settings.tax.rate, inclusive: settings.tax.pricesIncludeTax },
  };
  const zone = { key: zoneDoc.key, name: zoneDoc.name, estimate: zoneDoc.estimate, rule: { feeFils: toFils(zoneDoc.fee), freeThresholdFils: zoneDoc.freeThreshold != null ? toFils(zoneDoc.freeThreshold) : null } };
  const firstOrder = await isFirstOrder({ userId, phone: addr?.phone ?? input.phone, email: input.email });
  const totals = computeTotals({ lines, coupon: coupon?.rule, auto: autoOffersOf(settings, firstOrder), zone: zone.rule, method, rules });
  if (totals.couponBeaten) coupon = null; // a better automatic offer applies; the coupon stays unused

  if (coupon && totals.couponProblem) return { ok: false, error: totals.couponProblem === "min_subtotal" ? "coupon_min_subtotal" : "coupon_not_eligible" };
  if (totals.belowMinimum) return { ok: false, error: "below_minimum" };
  if (method === "cod" && settings.codMaxOrder > 0 && totals.total > settings.codMaxOrder) return { ok: false, error: "cod_limit" };

  if (!addr) return { ok: true, p: { buyer: { userId, guestId: input.guestId, email: input.email }, userId, method, source: input.buy ? "buy_now" : "cart", firstOrder, address: { recipientName: "", phone: "", emirate, area: "", building: "" }, zone, rules, settings: { codEnabled: settings.codEnabled, codMaxOrder: settings.codMaxOrder, pendingPaymentMinutes: settings.pendingPaymentMinutes }, lines, meta, coupon, totals } };
  return { ok: true, p: {
    buyer: { userId, guestId: input.guestId, email: input.email }, userId, method, source: input.buy ? "buy_now" : "cart", firstOrder,
    address: { id: addr._id ? String(addr._id) : undefined, recipientName: addr.recipientName, phone: addr.phone, emirate: addr.emirate, area: addr.area, street: addr.street ?? undefined, building: addr.building, unit: addr.unit ?? undefined, landmark: addr.landmark ?? undefined, instructions: addr.instructions ?? undefined },
    zone, rules, settings: { codEnabled: settings.codEnabled, codMaxOrder: settings.codMaxOrder, pendingPaymentMinutes: settings.pendingPaymentMinutes },
    lines, meta, coupon, totals,
  } };
}
