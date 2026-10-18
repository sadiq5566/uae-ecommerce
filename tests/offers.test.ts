import { describe, expect, it } from "vitest";
import { computeTotals, type AutoOffer, type CouponRule, type PriceLine, type Rules, type Zone } from "@/features/checkout/pricing";
import { toFils } from "@/features/checkout/money";
import { offerProgress, offerLines, type PublicOffers } from "@/features/offers/shared";
import en from "@/messages/en.json";

const line = (unit: number, qty = 1, sku = "A"): PriceLine => ({ sku, productId: "p-" + sku, categoryId: "c1", qty, unitFils: toFils(unit), listFils: toFils(unit) });
const rules: Rules = { minOrderFils: toFils(50), freeThresholdFils: toFils(200), codFeeFils: 0, tax: { enabled: false, rate: 0.05, inclusive: true } };
const zone: Zone = { feeFils: toFils(15) };
const tier: AutoOffer = { kind: "tier", percent: 10, minSubtotalFils: toFils(500) };
const first: AutoOffer = { kind: "first_order", percent: 10 };
const run = (lines: PriceLine[], o: { coupon?: CouponRule; auto?: AutoOffer[]; method?: string } = {}) =>
  computeTotals({ lines, coupon: o.coupon, auto: o.auto, zone, method: o.method ?? "cod", rules });
const coupon = (c: Partial<CouponRule>): CouponRule => ({ code: "C", type: "percent", value: 5, ...c });

describe("automatic offers (spend tier + first order)", () => {
  it("gives 10% off at AED 500 and free delivery, but nothing just below", () => {
    expect(run([line(499)], { auto: [tier] })).toMatchObject({ offerDiscount: 0, offer: undefined, deliveryFee: 0, total: 499 });
    const t = run([line(500)], { auto: [tier] });
    expect(t).toMatchObject({ offerDiscount: 50, discountedSubtotal: 450, deliveryFee: 0, total: 450, offer: { kind: "tier", percent: 10 } });
  });
  it("free delivery from AED 200, delivery fee below", () => {
    expect(run([line(199)])).toMatchObject({ deliveryFee: 15, freeDelivery: false, total: 214 });
    expect(run([line(200)])).toMatchObject({ deliveryFee: 0, freeDelivery: true, total: 200 });
  });
  it("automatic offers never cost the customer free delivery, but a coupon can", () => {
    expect(run([line(219)], { auto: [first] })).toMatchObject({ offerDiscount: 21.9, discountedSubtotal: 197.1, deliveryFee: 0, freeDelivery: true });
    expect(run([line(219)], { coupon: coupon({ type: "fixed", value: 30 }) })).toMatchObject({ couponDiscount: 30, deliveryFee: 15, freeDelivery: false });
  });
  it("first-order discount applies at any amount", () => {
    expect(run([line(100)], { auto: [first] })).toMatchObject({ offerDiscount: 10, offer: { kind: "first_order" }, total: 105 });
  });
  it("only ONE discount: first-order and spend-tier never stack, the larger wins", () => {
    const t = run([line(600)], { auto: [tier, first] });
    expect(t.offerDiscount).toBe(60); // 10% once, not 20%
    expect(t.total).toBe(540);
    const capped = run([line(600)], { auto: [{ ...tier, maxDiscountFils: toFils(30) }, { ...first, maxDiscountFils: toFils(40) }] });
    expect(capped).toMatchObject({ offerDiscount: 40, offer: { kind: "first_order" } });
  });
  it("a bigger coupon beats the automatic offer; a smaller coupon is beaten and reported", () => {
    const big = run([line(600)], { auto: [tier], coupon: coupon({ type: "fixed", value: 100 }) });
    expect(big).toMatchObject({ couponDiscount: 100, offerDiscount: 0, couponBeaten: false, offer: { kind: "coupon" }, total: 500 });
    const small = run([line(600)], { auto: [tier], coupon: coupon({ type: "percent", value: 5 }) });
    expect(small).toMatchObject({ couponDiscount: 0, offerDiscount: 60, couponBeaten: true, offer: { kind: "tier" } });
  });
  it("on a tie the customer's coupon is kept", () => {
    const t = run([line(600)], { auto: [tier], coupon: coupon({ type: "percent", value: 10 }) });
    expect(t).toMatchObject({ couponDiscount: 60, offerDiscount: 0, couponBeaten: false, offer: { kind: "coupon", code: "C" } });
  });
  it("splits the automatic discount across lines exactly (no fils lost)", () => {
    const t = run([line(333.33, 1, "A"), line(333.33, 1, "B"), line(0.01, 1, "C")], { auto: [first] });
    expect(t.lines.reduce((a, l) => a + l.couponShareFils, 0)).toBe(toFils(t.offerDiscount));
  });
});

describe("offer progress & ticker lines", () => {
  const offers: PublicOffers = {
    freeDelivery: { enabled: true, min: 200 }, tier: { enabled: true, min: 500, pct: 10 }, firstOrder: { enabled: true, pct: 10 },
    cod: true, returnDays: 7, modal: { enabled: true, delaySeconds: 2, version: "1", collectLeads: true },
  };
  it("nudges toward the nearest locked reward", () => {
    expect(offerProgress(150, offers).next).toEqual({ kind: "free", left: 50, target: 200 });
    expect(offerProgress(250, offers)).toMatchObject({ freeUnlocked: true, tierUnlocked: false, next: { kind: "tier", left: 250 } });
    expect(offerProgress(500, offers)).toMatchObject({ freeUnlocked: true, tierUnlocked: true, next: null });
  });
  it("advertises exactly the enabled offers", () => {
    const keys = (o: PublicOffers) => offerLines(o, en as never, "en").map((l) => l.key);
    expect(keys(offers)).toEqual(["free", "tier", "first", "cod", "returns"]);
    expect(keys({ ...offers, tier: { ...offers.tier, enabled: false }, returnDays: 0, cod: false })).toEqual(["free", "first"]);
  });
});
