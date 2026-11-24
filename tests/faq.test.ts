import { describe, expect, it } from "vitest";
import { buildProductFaqs, dedupeFaqs, faqPageJsonLd, localizeFaqs, storeFaqs, storeProductFaqs } from "../lib/faq";

const offers = { cod: true, returnDays: 7, freeDelivery: { enabled: true, all: true, min: 0 } };

describe("buildProductFaqs", () => {
  const watch = { name: "Cartier Santos", nameAr: "كارتييه سانتوس", brand: "Cartier", category: "watches", variants: [{ color: "Silver", size: "Small" }, { color: "Black", size: "Large" }], includedItems: ["Box"] };
  it("answers only from product data and flags rows as auto", () => {
    const f = buildProductFaqs(watch);
    expect(f.map((x) => x.q)).toEqual(expect.arrayContaining(["What is Cartier Santos?", "Which colours does Cartier Santos come in?", "Which sizes are available for Cartier Santos?", "What is included with Cartier Santos?"]));
    expect(f.every((x) => x.auto && x.qAr && x.aAr)).toBe(true);
    expect(f.find((x) => x.q.startsWith("Which colours"))!.a).toContain("Silver and Black");
  });
  it("skips questions the data cannot answer", () => {
    const q = buildProductFaqs({ name: "Plain Cap", category: "caps" }).map((x) => x.q);
    expect(q.some((x) => x.includes("colours") || x.includes("sizes") || x.includes("included"))).toBe(false);
  });
  it("never writes the store's own name into the shared catalogue", () => {
    const text = JSON.stringify(buildProductFaqs({ name: "Mystery Bag", category: "bags" }));
    expect(text).not.toContain("Oasis Home Market");
  });
  it("does not quote messy supplier size strings", () => {
    const sizes = Array.from({ length: 12 }, (_, i) => ({ size: `41mm / Watch: Dial ${i}` }));
    expect(buildProductFaqs({ name: "W", category: "watches", variants: sizes }).some((x) => x.q.startsWith("Which sizes"))).toBe(false);
  });
});

describe("live store FAQs", () => {
  it("builds price, Dubai delivery, COD and returns in both languages", () => {
    const f = storeProductFaqs({ name: "Cartier Santos", nameAr: "كارتييه سانتوس", store: "Oasis", price: 349, inStock: true, offers });
    expect(f.en.map((x) => x.q).join("|")).toMatch(/price.*Dubai.*cash on delivery.*return/is);
    expect(f.en[0].a).toContain("AED 349");
    expect(f.ar).toHaveLength(f.en.length);
  });
  it("omits cash on delivery and returns when the store does not offer them", () => {
    const f = storeProductFaqs({ name: "X", store: "S", price: 10, inStock: false, offers: { cod: false, returnDays: 0, freeDelivery: { enabled: false, min: 0 } } });
    expect(f.en.map((x) => x.q).join("|")).not.toMatch(/cash on delivery|return/i);
    expect(f.en[0].a).toContain("out of stock");
  });
  it("store FAQ for the home page names the store and covers Dubai", () => {
    expect(storeFaqs({ store: "Oasis", cod: true, returnDays: 7 }).en[1].q).toContain("Dubai");
  });
});

describe("helpers", () => {
  it("localizes with Arabic falling back to English and drops blank rows", () => {
    expect(localizeFaqs([{ q: "Q", a: "A", qAr: "س", aAr: "ج" }, { q: "Q2", a: "A2" }, { q: "", a: "x" }], "ar")).toEqual([{ q: "س", a: "ج" }, { q: "Q2", a: "A2" }]);
  });
  it("dedupes the same question ignoring case and punctuation", () => {
    expect(dedupeFaqs([{ q: "Is it good?", a: "1" }, { q: "is it good", a: "2" }])).toHaveLength(1);
  });
  it("keeps different Arabic questions apart", () => {
    expect(dedupeFaqs([{ q: "ما هو الساعة؟", a: "1" }, { q: "هل يمكن الإرجاع؟", a: "2" }, { q: "هل يمكن الإرجاع", a: "3" }])).toHaveLength(2);
  });
  it("FAQPage JSON-LD mirrors the visible questions", () => {
    const ld = faqPageJsonLd([{ q: "Q", a: "A" }], "en", "https://x.ae/en");
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity[0].acceptedAnswer.text).toBe("A");
  });
});
