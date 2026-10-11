import "server-only";
import { cache } from "react";
import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { getProvider } from "@/lib/payments";
import { Address } from "@/models/address";
import { Cart } from "@/models/cart";
import { Coupon, type CouponDoc } from "@/models/coupon";
import { CouponRedemption } from "@/models/coupon-redemption";
import { DeliveryZone } from "@/models/delivery-zone";
import { Product } from "@/models/product";
import { Settings } from "@/models/settings";
import type { PaymentMethod } from "@/models/order";
import { toFils } from "./money";
import { computeTotals, type CouponRule, type PriceLine, type Rules, type Totals, type Zone } from "./pricing";

type L10n = { en: string; ar: string };

export type CheckoutError =
  | "empty_cart" | "cart_issues" | "no_address" | "below_minimum" | "method_unavailable" | "cod_limit"
  | "coupon_invalid" | "coupon_expired" | "coupon_used_up" | "coupon_customer_limit" | "coupon_min_subtotal" | "coupon_not_eligible"
  | "no_zone" | "total_changed" | "out_of_stock" | "invalid";

export type LineMeta = { sku: string; productId: string; name: L10n; variantLabel?: L10n; icon: string; image?: string };
export type Prepared = {
  userId: string; method: PaymentMethod;
  address: { id: string; recipientName: string; phone: string; emirate: string; area: string; street?: string; building: string; unit?: string; landmark?: string; instructions?: string };
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
  const provider = getProvider();
  if (provider) out.push(...provider.methods);
  if (s.codEnabled) out.push("cod");
  return out;
}

type ProductRow = {
  _id: Types.ObjectId; slug: string; sku: string; name: L10n; icon: string; category: Types.ObjectId; images?: { url: string }[];
  price: number; finalPrice: number; stock: number; variants?: { sku: string; label: L10n; stock: number; price?: number }[];
};

export async function validateCoupon(code: string, userId: string, now = new Date()): Promise<{ doc: CouponDoc & { _id: Types.ObjectId } } | { error: CheckoutError }> {
  await connectDb();
  const doc = (await Coupon.findOne({ code: code.trim().toUpperCase() }).lean()) as (CouponDoc & { _id: Types.ObjectId }) | null;
  if (!doc || !doc.active) return { error: "coupon_invalid" };
  if ((doc.startsAt && doc.startsAt > now) || (doc.endsAt && doc.endsAt < now)) return { error: "coupon_expired" };
  if (doc.usageLimit != null && doc.usedCount >= doc.usageLimit) return { error: "coupon_used_up" };
  const used = await CouponRedemption.countDocuments({ coupon: doc._id, user: userId });
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
export async function prepare(input: { userId: string; addressId?: string; method: PaymentMethod; couponCode?: string }): Promise<{ ok: true; p: Prepared } | { ok: false; error: CheckoutError; detail?: string }> {
  await connectDb();
  const { userId, method } = input;
  const settings = await getSettings();
  if (!(await availableMethods()).includes(method)) return { ok: false, error: "method_unavailable" };

  const cart = await Cart.findOne({ user: userId }).lean();
  if (!cart?.items.length) return { ok: false, error: "empty_cart" };
  const skus = cart.items.map((i) => i.sku);
  const rows = (await Product.find({ status: "published", $or: [{ sku: { $in: skus } }, { "variants.sku": { $in: skus } }] }).lean()) as unknown as ProductRow[];
  const found = new Map<string, { p: ProductRow; v?: NonNullable<ProductRow["variants"]>[number] }>();
  for (const p of rows) { if (p.variants?.length) p.variants.forEach((v) => found.set(v.sku, { p, v })); else found.set(p.sku, { p }); }

  const lines: PriceLine[] = []; const meta: LineMeta[] = [];
  for (const it of cart.items) {
    const hit = found.get(it.sku);
    const stock = hit ? (hit.v ? hit.v.stock : hit.p.stock) : 0;
    if (!hit || stock < it.qty) return { ok: false, error: "cart_issues", detail: it.sku }; // never silently change what they pay for
    const unit = hit.v?.price ?? hit.p.finalPrice;
    lines.push({ sku: it.sku, productId: String(hit.p._id), categoryId: String(hit.p.category), qty: it.qty, unitFils: toFils(unit), listFils: toFils(Math.max(hit.p.price, unit)) });
    meta.push({ sku: it.sku, productId: String(hit.p._id), name: hit.p.name, variantLabel: hit.v?.label, icon: hit.p.icon, image: hit.p.images?.[0]?.url });
  }

  if (!input.addressId || !Types.ObjectId.isValid(input.addressId)) return { ok: false, error: "no_address" };
  const addr = await Address.findOne({ _id: input.addressId, user: userId }).lean(); // ownership enforced in the query
  if (!addr) return { ok: false, error: "no_address" };
  const zoneDoc = await DeliveryZone.findOne({ active: true, emirates: addr.emirate }).lean();
  if (!zoneDoc) return { ok: false, error: "no_zone" };

  let coupon: Prepared["coupon"] = null;
  if (input.couponCode?.trim()) {
    const v = await validateCoupon(input.couponCode, userId);
    if ("error" in v) return { ok: false, error: v.error };
    coupon = { doc: v.doc, rule: ruleOf(v.doc) };
  }

  const rules: Rules = {
    minOrderFils: toFils(settings.minOrder), freeThresholdFils: toFils(settings.freeDeliveryThreshold), codFeeFils: toFils(settings.codFee),
    tax: { enabled: settings.tax.enabled, rate: settings.tax.rate, inclusive: settings.tax.pricesIncludeTax },
  };
  const zone = { key: zoneDoc.key, name: zoneDoc.name, estimate: zoneDoc.estimate, rule: { feeFils: toFils(zoneDoc.fee), freeThresholdFils: zoneDoc.freeThreshold != null ? toFils(zoneDoc.freeThreshold) : null } };
  const totals = computeTotals({ lines, coupon: coupon?.rule, zone: zone.rule, method, rules });

  if (coupon && totals.couponProblem) return { ok: false, error: totals.couponProblem === "min_subtotal" ? "coupon_min_subtotal" : "coupon_not_eligible" };
  if (totals.belowMinimum) return { ok: false, error: "below_minimum" };
  if (method === "cod" && settings.codMaxOrder > 0 && totals.total > settings.codMaxOrder) return { ok: false, error: "cod_limit" };

  return { ok: true, p: {
    userId, method,
    address: { id: String(addr._id), recipientName: addr.recipientName, phone: addr.phone, emirate: addr.emirate, area: addr.area, street: addr.street ?? undefined, building: addr.building, unit: addr.unit ?? undefined, landmark: addr.landmark ?? undefined, instructions: addr.instructions ?? undefined },
    zone, rules, settings: { codEnabled: settings.codEnabled, codMaxOrder: settings.codMaxOrder, pendingPaymentMinutes: settings.pendingPaymentMinutes },
    lines, meta, coupon, totals,
  } };
}
