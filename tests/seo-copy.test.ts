import { describe, expect, it } from "vitest";
import { guessCategory } from "../lib/category";
import { STORE_NAME, categoryCopy, cleanName, hasSupplierName, plainName, productCopy, resolveBrand, stripSupplier } from "../lib/seo-copy";

describe("supplier names", () => {
  it("replaces Rimal / Carts Heaven with the store name", () => {
    expect(stripSupplier("Why Shop with Rimal?")).toBe(`Why Shop with ${STORE_NAME}?`);
    expect(stripSupplier("Rimal UAE")).toBe(STORE_NAME);
    expect(hasSupplierName("sold by carts heaven")).toBe(true);
    expect(hasSupplierName("Primal Rimalo")).toBe(false);
  });
  it("brand: keeps real brands, replaces shop names with the brand in the name, else the store", () => {
    expect(resolveBrand("Rolex", "x")).toBe("Rolex");
    expect(resolveBrand("Rimal UAE", "Zegna Suede Sneakers")).toBe("Zegna");
    expect(resolveBrand("Rimal UAE", "On Cloud | Cloudnova Sneakers")).toBe("On Cloud");
    expect(resolveBrand("Rimal UAE", "قبعة غوتشي جامبو سوداء")).toBe("Gucci");
    expect(resolveBrand("Rimal UAE", "Totally plain thing")).toBe(STORE_NAME);
    expect(resolveBrand(undefined, "Plain thing")).toBe(STORE_NAME);
  });
  it("drops the internal import code and the pipe separator", () => {
    expect(cleanName("Messika (GEN-7B296406)")).toBe("Messika");
    expect(cleanName("Louis Vuitton (GEN-30C158A0-GOLD)")).toBe("Louis Vuitton");
    expect(plainName("Louis Vuitton | LV Belt")).toBe("Louis Vuitton LV Belt");
  });
});

describe("category hints", () => {
  it.each([
    ["Louis Vuitton Orange Focus Pouch", "bags"], ["Dior Vertical Bi Fold Camel Card Holder", "bags"], ["On Cloud | Cloudnova Sneakers", "footwear"],
    ["Cartier | CT0462S Gradient", "glasses"], ["قبعة غوتشي جامبو سوداء", "caps"], ["حزام هيرميس | شعار ذهبي", "belts"], ["Gucci | Interlocking G Belt – Black", "belts"], ["Louis Vuitton keychain", "accessories"], ["هيرميس | صنادل إزمير", "footwear"],
    ["ساعة رولكس ديت جست", "watches"], ["Prada Towel | Microfiber Mint Green", "home"], ["Calvin Klein Logo Boxer Brief 3-Pack for Men", "apparel"], ["Polo Ralph Lauren cap", "caps"],
  ])("%s -> %s", (name, cat) => expect(guessCategory(name)).toBe(cat));
});

describe("generated copy", () => {
  const c = productCopy({ sku: "A1", name: "Gucci GG Logo Brown Camel Cap", brand: "Gucci", category: "caps" });
  it("fits search result limits and mentions the UAE", () => {
    expect(c.seoTitle.length).toBeLessThanOrEqual(62);
    expect(c.seoTitle).toContain("Gucci GG Logo Brown Camel Cap");
    expect(c.seoDescription.length).toBeLessThanOrEqual(158);
    expect(c.seoDescription).toMatch(/UAE/);
    expect(c.shortDescription!.length).toBeLessThanOrEqual(155);
    expect(c.longDescription).toContain(`Why shop with ${STORE_NAME}?`);
  });
  it("never contains a supplier name", () => {
    expect(hasSupplierName(c.longDescription) || hasSupplierName(c.seoTitle)).toBe(false);
  });
  it("very long names are shortened, not overflowed", () => {
    expect(productCopy({ sku: "B", name: "x".repeat(40) + " " + "word ".repeat(30), brand: "Gucci", category: "bags" }).seoTitle.length).toBeLessThanOrEqual(62);
  });
  it("Arabic names get an Arabic description and no English body", () => {
    const a = productCopy({ sku: "C", name: "قبعة غوتشي جامبو سوداء", brand: "Gucci", category: "caps" });
    expect(a.seoDescription).toMatch(/الإمارات/);
    expect("longDescription" in a).toBe(false);
  });
  it("category copy", () => {
    const k = categoryCopy("Sunglasses", ["Cartier", "Prada", "Gucci"], 330);
    expect(k.title).toContain("Sunglasses");
    expect(k.description.length).toBeLessThanOrEqual(158);
  });
});
