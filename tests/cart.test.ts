import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("@/lib/db", () => ({ connectDb: async () => {} }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => null }));

const { buildLines, clampQty, mergeItems, summarize, MAX_QTY } = await import("@/features/cart/service");

const prod = (over = {}) => ({ _id: "1", slug: "p", sku: "A", name: { en: "A", ar: "أ" }, icon: "x", hue: 1, price: 100, finalPrice: 80, stock: 5, ...over });

describe("clampQty", () => {
  it("never exceeds stock or the per-line cap", () => {
    expect(clampQty(3, 5)).toBe(3);
    expect(clampQty(9, 5)).toBe(5);
    expect(clampQty(50, 100)).toBe(MAX_QTY);
    expect(clampQty(2, 0)).toBe(0);
    expect(clampQty(-4, 5)).toBe(0);
  });
});

describe("buildLines (server-side validation of stored carts)", () => {
  const found = (p: ReturnType<typeof prod>) => new Map([["A", { p: p as never }]]);
  it("uses catalogue price, not the price stored when added", () => {
    const [l] = buildLines([{ sku: "A", qty: 2, priceAtAdd: 50 }], found(prod()));
    expect(l.unitPrice).toBe(80);
    expect(l.priceChanged).toBe(true);
    expect(l.lineTotal).toBe(160);
  });
  it("reduces quantity to available stock and flags it", () => {
    const [l] = buildLines([{ sku: "A", qty: 9, priceAtAdd: 80 }], found(prod({ stock: 3 })));
    expect(l).toMatchObject({ qty: 3, requestedQty: 9, status: "reduced" });
  });
  it("flags out-of-stock and unavailable lines and excludes them from totals", () => {
    const lines = buildLines([{ sku: "A", qty: 1, priceAtAdd: 80 }, { sku: "GONE", qty: 1, priceAtAdd: 10 }], found(prod({ stock: 0 })));
    expect(lines.map((l) => l.status)).toEqual(["out_of_stock", "unavailable"]);
    const s = summarize(lines);
    expect(s).toMatchObject({ itemCount: 0, subtotal: 0, hasIssues: true });
  });
  it("rounds money to 2 decimals", () => {
    const s = summarize(buildLines([{ sku: "A", qty: 3, priceAtAdd: 33.33 }], found(prod({ finalPrice: 33.33 }))));
    expect(s.subtotal).toBe(99.99);
  });
});

describe("mergeItems (guest → user cart merge)", () => {
  const stock = (n: number) => () => n;
  it("combines the same SKU without duplicating lines", () => {
    const out = mergeItems([{ sku: "A", qty: 2, priceAtAdd: 1 }], [{ sku: "A", qty: 3, priceAtAdd: 1 }, { sku: "B", qty: 1, priceAtAdd: 1 }], stock(10));
    expect(out).toHaveLength(2);
    expect(out.find((i) => i.sku === "A")?.qty).toBe(5);
  });
  it("clamps merged quantity to stock", () => {
    const out = mergeItems([{ sku: "A", qty: 4, priceAtAdd: 1 }], [{ sku: "A", qty: 4, priceAtAdd: 1 }], stock(6));
    expect(out[0].qty).toBe(6);
  });
  it("keeps items whose stock is unknown/zero so the cart can flag them", () => {
    const out = mergeItems([], [{ sku: "X", qty: 2, priceAtAdd: 1 }], () => undefined);
    expect(out).toEqual([{ sku: "X", qty: 2, priceAtAdd: 1 }]);
  });
});
