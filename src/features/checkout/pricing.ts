import { fromFils, percentOf, toFils } from "./money";

/*
 * Calculation order (single source of truth — the server runs this at quote AND at order time):
 *  1. Item subtotal      = Σ current effective unit price × qty        (item sale prices already applied)
 *  2. Discount           = ONE per order, the largest of: coupon (eligible lines only; percent capped, or fixed),
 *                          spend-tier % and first-order % (both on the whole subtotal). Never above the base it applies to.
 *  3. Discounted subtotal= (1) − (2)
 *  4. Delivery fee       = zone fee, or 0 when (1) − coupon ≥ free-delivery threshold (automatic offers don't reduce it)
 *  5. COD fee            = configured fee when paying by cash on delivery
 *  6. Tax (configurable) = base (3)+(4)+(5); inclusive → shown, already in total; exclusive → added
 *  7. Total              = (3)+(4)+(5) [+ tax if exclusive]
 * Minimum order is checked against (1) − item discounts already included, before the coupon.
 */

export type PriceLine = { sku: string; productId: string; categoryId: string; qty: number; unitFils: number; listFils: number };
export type CouponRule = {
  code: string; type: "percent" | "fixed"; value: number; maxDiscountFils?: number; minSubtotalFils?: number;
  products?: string[]; categories?: string[]; excludeProducts?: string[]; excludeCategories?: string[]; stackWithSale?: boolean;
};
export type Rules = {
  minOrderFils: number; freeThresholdFils: number; codFeeFils: number;
  tax: { enabled: boolean; rate: number; inclusive: boolean };
};
export type AutoOffer = { kind: "tier" | "first_order"; percent: number; maxDiscountFils?: number; minSubtotalFils?: number };
export type Zone = { feeFils: number; freeThresholdFils?: number | null };
export type CouponProblem = "min_subtotal" | "not_eligible";
export type AppliedOffer = { kind: "coupon" | "tier" | "first_order"; code?: string; percent?: number };

export type Totals = {
  lines: (PriceLine & { lineFils: number; couponShareFils: number })[];
  listSubtotal: number; itemDiscounts: number; subtotal: number;
  couponDiscount: number; offerDiscount: number; offer?: AppliedOffer; couponBeaten: boolean; autoBest: number; autoBestOffer?: AppliedOffer; discountedSubtotal: number; deliveryFee: number; codFee: number;
  tax: number; taxIncluded: boolean; total: number;
  freeDelivery: boolean; belowMinimum: boolean; minOrder: number; couponProblem?: CouponProblem;
};

function eligible(line: PriceLine, c: CouponRule) {
  if (c.excludeProducts?.includes(line.productId) || c.excludeCategories?.includes(line.categoryId)) return false;
  if (!c.stackWithSale && line.unitFils < line.listFils) return false; // already discounted → no stacking by default
  const hasInclude = (c.products?.length ?? 0) + (c.categories?.length ?? 0) > 0;
  if (!hasInclude) return true;
  return !!(c.products?.includes(line.productId) || c.categories?.includes(line.categoryId));
}

export function computeTotals(input: { lines: PriceLine[]; coupon?: CouponRule | null; auto?: AutoOffer[]; zone: Zone; method: string; rules: Rules }): Totals {
  const { rules, zone } = input;
  const lines = input.lines.map((l) => ({ ...l, lineFils: l.unitFils * l.qty, couponShareFils: 0 }));
  const subtotalF = lines.reduce((a, l) => a + l.lineFils, 0);
  const listF = lines.reduce((a, l) => a + l.listFils * l.qty, 0);

  let couponF = 0;
  let couponProblem: CouponProblem | undefined;
  const c = input.coupon;
  if (c) {
    const elig = lines.filter((l) => eligible(l, c));
    const eligF = elig.reduce((a, l) => a + l.lineFils, 0);
    if (eligF === 0) couponProblem = "not_eligible";
    else if (c.minSubtotalFils && eligF < c.minSubtotalFils) couponProblem = "min_subtotal";
    else {
      couponF = c.type === "percent" ? percentOf(eligF, Math.min(c.value, 100)) : toFils(c.value);
      if (c.maxDiscountFils != null) couponF = Math.min(couponF, c.maxDiscountFils);
      couponF = Math.min(couponF, eligF);
      // Allocate across eligible lines proportionally (remainder to the last) so refunds/returns can be pro-rated.
      let left = couponF;
      elig.forEach((l, i) => {
        const share = i === elig.length - 1 ? left : Math.floor((couponF * l.lineFils) / eligF);
        l.couponShareFils = share; left -= share;
      });
    }
  }

  // Automatic offers: the best one that qualifies, on the whole subtotal.
  let autoF = 0; let autoOffer: AppliedOffer | undefined;
  for (const a of input.auto ?? []) {
    if (a.minSubtotalFils && subtotalF < a.minSubtotalFils) continue;
    let d = percentOf(subtotalF, Math.min(a.percent, 100));
    if (a.maxDiscountFils != null) d = Math.min(d, a.maxDiscountFils);
    d = Math.min(d, subtotalF);
    if (d > autoF) { autoF = d; autoOffer = { kind: a.kind, percent: a.percent }; }
  }
  // One discount per order: keep the larger. A coupon that loses is not consumed (the caller sees couponBeaten).
  const autoBestF = autoF; const autoBestOffer = autoOffer; // what the automatic offers alone would give (shown so shoppers can compare codes)
  const couponBeaten = couponF > 0 && autoF > couponF; // on a tie the customer's coupon is kept
  let offer: AppliedOffer | undefined = couponF > 0 ? { kind: "coupon", code: c?.code } : undefined;
  if (couponBeaten || (couponF === 0 && autoF > 0)) {
    let left = autoF;
    lines.forEach((l, i) => { const share = i === lines.length - 1 ? left : Math.floor((autoF * l.lineFils) / subtotalF); l.couponShareFils = share; left -= share; });
    couponF = 0; offer = autoOffer;
  } else autoF = 0;
  const discountedF = subtotalF - couponF - autoF;
  const threshold = zone.freeThresholdFils ?? rules.freeThresholdFils;
  // "Free delivery over AED 200" is judged on the basket value: a coupon lowers it, but the automatic offers don't
  // (a 219 basket with a 10% first-order discount still qualifies — that's what the store advertises).
  const freeDelivery = lines.length > 0 && threshold > 0 && subtotalF - couponF >= threshold;
  const deliveryF = lines.length === 0 || freeDelivery ? 0 : zone.feeFils;
  const codF = input.method === "cod" ? rules.codFeeFils : 0;

  const base = discountedF + deliveryF + codF;
  let taxF = 0;
  if (rules.tax.enabled) taxF = rules.tax.inclusive ? Math.round(base - base / (1 + rules.tax.rate)) : Math.round(base * rules.tax.rate);
  const totalF = base + (rules.tax.enabled && !rules.tax.inclusive ? taxF : 0);

  return {
    lines, listSubtotal: fromFils(listF), itemDiscounts: fromFils(listF - subtotalF), subtotal: fromFils(subtotalF),
    couponDiscount: fromFils(couponF), offerDiscount: fromFils(autoF), offer, couponBeaten, autoBest: fromFils(autoBestF), autoBestOffer, discountedSubtotal: fromFils(discountedF), deliveryFee: fromFils(deliveryF), codFee: fromFils(codF),
    tax: fromFils(taxF), taxIncluded: rules.tax.enabled && rules.tax.inclusive, total: fromFils(totalF),
    freeDelivery, belowMinimum: subtotalF < rules.minOrderFils, minOrder: fromFils(rules.minOrderFils), couponProblem,
  };
}
