import { describe, expect, it } from "vitest";
import { categories, products } from "../scripts/seed-data";
import { Product } from "@/models/product";

describe("seed data", () => {
  it("has unique slugs and valid category references", () => {
    const slugs = new Set(categories.map((c) => c.slug));
    expect(slugs.size).toBe(categories.length);
    expect(new Set(products.map((p) => p.slug)).size).toBe(products.length);
    for (const p of products) expect(slugs.has(p.cat)).toBe(true);
    for (const c of categories) if ("parent" in c && c.parent) expect(slugs.has(c.parent)).toBe(true);
  });
  it("only uses attribute keys declared on the category", () => {
    for (const p of products) {
      const keys = categories.find((c) => c.slug === p.cat)!.attributes.map((a) => a.key);
      for (const k of Object.keys(p.attrs ?? {})) expect(keys).toContain(k);
    }
  });
  it("sale prices are below list prices", () => {
    for (const p of products) if (p.sale != null) expect(p.sale).toBeLessThan(p.price);
  });
});

describe("Product model", () => {
  const base = { slug: "x", sku: "x-1", name: { en: "X", ar: "إكس" }, category: "64b000000000000000000001", price: 100 };
  it("derives finalPrice from a valid sale price", async () => {
    const d = new Product({ ...base, salePrice: 80 });
    await d.validate();
    expect(d.finalPrice).toBe(80);
    expect(d.sku).toBe("X-1");
  });
  it("ignores a sale price that is not lower than the price", async () => {
    const d = new Product({ ...base, salePrice: 120 });
    await d.validate();
    expect(d.finalPrice).toBe(100);
  });
  it("rejects negative prices", async () => {
    await expect(new Product({ ...base, price: -1 }).validate()).rejects.toThrow();
  });
});
