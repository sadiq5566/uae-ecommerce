import { describe, expect, it } from "vitest";
import { computeTotals, type CouponRule, type PriceLine, type Rules, type Zone } from "@/features/checkout/pricing";
import { percentOf, toFils } from "@/features/checkout/money";

const line = (o: Partial<PriceLine> & { unit: number; list?: number }): PriceLine => ({
  sku: o.sku ?? "A", productId: o.productId ?? "p1", categoryId: o.categoryId ?? "c1", qty: o.qty ?? 1, unitFils: toFils(o.unit), listFils: toFils(o.list ?? o.unit),
});
const rules: Rules = { minOrderFils: toFils(50), freeThresholdFils: toFils(200), codFeeFils: 0, tax: { enabled: false, rate: 0.05, inclusive: true } };
const zone: Zone = { feeFils: toFils(15) };
const run = (lines: PriceLine[], extra: { coupon?: CouponRule; zone?: Zone; method?: string; rules?: Partial<Rules> } = {}) =>
  computeTotals({ lines, coupon: extra.coupon, zone: extra.zone ?? zone, method: extra.method ?? "card", rules: { ...rules, ...extra.rules } });

describe("money", () => {
  it("converts without float drift", () => {
    expect(toFils(19.99)).toBe(1999);
    expect(toFils(0.1 + 0.2)).toBe(30);
    expect(percentOf(1050, 10)).toBe(105);
    expect(percentOf(1005, 10)).toBe(101); // 100.5 rounds half up
  });
});

describe("computeTotals — basics & rounding", () => {
  it("sums lines and adds delivery below the free threshold", () => {
    const t = run([line({ unit: 33.33, qty: 3 })]);
    expect(t.subtotal).toBe(99.99);
    expect(t.deliveryFee).toBe(15);
    expect(t.total).toBe(114.99);
  });
  it("tracks item (sale) discounts separately from list price", () => {
    const t = run([line({ unit: 80, list: 100, qty: 2 })]);
    expect(t).toMatchObject({ listSubtotal: 200, itemDiscounts: 40, subtotal: 160 });
  });
  it("never produces float artefacts across many lines", () => {
    const t = run(Array.from({ length: 7 }, (_, i) => line({ sku: `S${i}`, unit: 0.1 + i * 0.07, qty: 3 })));
    expect(Number.isInteger(Math.round(t.total * 100))).toBe(true);
    expect(t.total).toBe(Math.round(t.total * 100) / 100);
  });
});

describe("delivery fee & free delivery", () => {
  it("is free exactly at the threshold, charged one fils below", () => {
    expect(run([line({ unit: 200 })]).deliveryFee).toBe(0);
    expect(run([line({ unit: 199.99 })]).deliveryFee).toBe(15);
  });
  it("uses a zone-specific threshold override", () => {
    const z: Zone = { feeFils: toFils(25), freeThresholdFils: toFils(300) };
    expect(run([line({ unit: 250 })], { zone: z }).deliveryFee).toBe(25);
    expect(run([line({ unit: 300 })], { zone: z }).deliveryFee).toBe(0);
  });
  it("applies zone fees", () => {
    expect(run([line({ unit: 100 })], { zone: { feeFils: toFils(20) } }).deliveryFee).toBe(20);
  });
  it("threshold 0 disables free delivery", () => {
    expect(run([line({ unit: 1000 })], { rules: { freeThresholdFils: 0 } }).deliveryFee).toBe(15);
  });
  it("evaluates the threshold AFTER the coupon", () => {
    const c: CouponRule = { code: "X", type: "fixed", value: 30 };
    const t = run([line({ unit: 210 })], { coupon: c });
    expect(t.discountedSubtotal).toBe(180);
    expect(t.deliveryFee).toBe(15);
  });
});

describe("COD fee", () => {
  it("is added only for cash on delivery", () => {
    const r = { codFeeFils: toFils(10) };
    expect(run([line({ unit: 100 })], { method: "cod", rules: r }).codFee).toBe(10);
    expect(run([line({ unit: 100 })], { method: "card", rules: r }).codFee).toBe(0);
    expect(run([line({ unit: 100 })], { method: "cod", rules: r }).total).toBe(125);
  });
});

describe("minimum order", () => {
  it("flags carts below the minimum (before coupon)", () => {
    expect(run([line({ unit: 49.99 })]).belowMinimum).toBe(true);
    expect(run([line({ unit: 50 })]).belowMinimum).toBe(false);
  });
});

describe("coupons", () => {
  const pct: CouponRule = { code: "P", type: "percent", value: 10 };
  it("percent discount rounds half up and respects the cap", () => {
    expect(run([line({ unit: 100.05 })], { coupon: pct }).couponDiscount).toBe(10.01);
    expect(run([line({ unit: 1000 })], { coupon: { ...pct, maxDiscountFils: toFils(50) } }).couponDiscount).toBe(50);
  });
  it("fixed discount can never exceed the eligible subtotal", () => {
    const t = run([line({ unit: 20 })], { coupon: { code: "F", type: "fixed", value: 100 }, rules: { minOrderFils: 0 } });
    expect(t.couponDiscount).toBe(20);
    expect(t.discountedSubtotal).toBe(0);
  });
  it("does not stack with sale prices by default", () => {
    const sale = line({ unit: 80, list: 100, sku: "S", productId: "sale" });
    const full = line({ unit: 100, sku: "F", productId: "full" });
    const t = run([sale, full], { coupon: pct });
    expect(t.couponDiscount).toBe(10); // 10% of the full-price item only
    expect(t.lines.find((l) => l.sku === "S")!.couponShareFils).toBe(0);
  });
  it("stacks with sale prices only when explicitly allowed", () => {
    const sale = line({ unit: 80, list: 100 });
    expect(run([sale], { coupon: { ...pct, stackWithSale: true } }).couponDiscount).toBe(8);
    expect(run([sale], { coupon: pct }).couponProblem).toBe("not_eligible");
  });
  it("limits to included products/categories and honours exclusions", () => {
    const a = line({ sku: "A", productId: "a", categoryId: "cat1", unit: 100 });
    const b = line({ sku: "B", productId: "b", categoryId: "cat2", unit: 100 });
    expect(run([a, b], { coupon: { ...pct, categories: ["cat1"] } }).couponDiscount).toBe(10);
    expect(run([a, b], { coupon: { ...pct, products: ["b"] } }).couponDiscount).toBe(10);
    expect(run([a, b], { coupon: { ...pct, excludeProducts: ["a"] } }).couponDiscount).toBe(10);
    expect(run([a, b], { coupon: { ...pct, excludeCategories: ["cat1", "cat2"] } }).couponProblem).toBe("not_eligible");
  });
  it("enforces the minimum eligible subtotal", () => {
    const c: CouponRule = { ...pct, minSubtotalFils: toFils(150) };
    expect(run([line({ unit: 100 })], { coupon: c }).couponProblem).toBe("min_subtotal");
    expect(run([line({ unit: 150 })], { coupon: c }).couponProblem).toBeUndefined();
  });
  it("splits the discount across lines without losing a fils", () => {
    const lines = [line({ sku: "A", unit: 33.33, productId: "a" }), line({ sku: "B", unit: 33.33, productId: "b" }), line({ sku: "C", unit: 33.34, productId: "c" })];
    const t = run(lines, { coupon: { code: "F", type: "fixed", value: 10 } });
    expect(t.lines.reduce((a, l) => a + l.couponShareFils, 0)).toBe(1000);
  });
});

describe("tax (configurable, off by default)", () => {
  it("adds nothing when disabled", () => {
    expect(run([line({ unit: 100 })]).tax).toBe(0);
  });
  it("inclusive: reports included tax, total unchanged", () => {
    const t = run([line({ unit: 100 })], { rules: { tax: { enabled: true, rate: 0.05, inclusive: true } } });
    expect(t.total).toBe(115); // 100 + 15 delivery
    expect(t.tax).toBe(5.48); // 115 − 115/1.05
    expect(t.taxIncluded).toBe(true);
  });
  it("exclusive: adds tax on goods + delivery", () => {
    const t = run([line({ unit: 100 })], { rules: { tax: { enabled: true, rate: 0.05, inclusive: false } } });
    expect(t.tax).toBe(5.75);
    expect(t.total).toBe(120.75);
  });
});
