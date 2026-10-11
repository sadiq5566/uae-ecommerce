import { fromFils, percentOf, toFils } from "./money";

/*
 * Calculation order (single source of truth — the server runs this at quote AND at order time):
 *  1. Item subtotal      = Σ current effective unit price × qty        (item sale prices already applied)
 *  2. Coupon discount    = on eligible lines only; percent (capped) or fixed; never above eligible subtotal
 *  3. Discounted subtotal= (1) − (2)
 *  4. Delivery fee       = zone fee, or 0 when (3) ≥ free-delivery threshold
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
export type Zone = { feeFils: number; freeThresholdFils?: number | null };
export type CouponProblem = "min_subtotal" | "not_eligible";

export type Totals = {
  lines: (PriceLine & { lineFils: number; couponShareFils: number })[];
  listSubtotal: number; itemDiscounts: number; subtotal: number;
  couponDiscount: number; discountedSubtotal: number; deliveryFee: number; codFee: number;
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

export function computeTotals(input: { lines: PriceLine[]; coupon?: CouponRule | null; zone: Zone; method: string; rules: Rules }): Totals {
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

  const discountedF = subtotalF - couponF;
  const threshold = zone.freeThresholdFils ?? rules.freeThresholdFils;
  const freeDelivery = lines.length > 0 && threshold > 0 && discountedF >= threshold;
  const deliveryF = lines.length === 0 || freeDelivery ? 0 : zone.feeFils;
  const codF = input.method === "cod" ? rules.codFeeFils : 0;

  const base = discountedF + deliveryF + codF;
  let taxF = 0;
  if (rules.tax.enabled) taxF = rules.tax.inclusive ? Math.round(base - base / (1 + rules.tax.rate)) : Math.round(base * rules.tax.rate);
  const totalF = base + (rules.tax.enabled && !rules.tax.inclusive ? taxF : 0);

  return {
    lines, listSubtotal: fromFils(listF), itemDiscounts: fromFils(listF - subtotalF), subtotal: fromFils(subtotalF),
    couponDiscount: fromFils(couponF), discountedSubtotal: fromFils(discountedF), deliveryFee: fromFils(deliveryF), codFee: fromFils(codF),
    tax: fromFils(taxF), taxIncluded: rules.tax.enabled && rules.tax.inclusive, total: fromFils(totalF),
    freeDelivery, belowMinimum: subtotalF < rules.minOrderFils, minOrder: fromFils(rules.minOrderFils), couponProblem,
  };
}
