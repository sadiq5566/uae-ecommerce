import type { CategoryView } from "./service";

/** The categories the shop leads with, in display order. `label` is the customer-facing name (the stored category slug stays "watches" / "bags"). */
export const MAIN_CATEGORIES = [
  { slug: "jewelry", label: { en: "Jewelry", ar: "المجوهرات" }, tagline: { en: "Fine pieces for every day", ar: "قطع راقية لكل يوم" }, hue: 38 },
  { slug: "perfume", label: { en: "Perfume", ar: "العطور" }, tagline: { en: "Signature scents", ar: "عطور مميزة" }, hue: 320 },
  { slug: "watches", label: { en: "Ladies Watches", ar: "ساعات نسائية" }, tagline: { en: "Time, beautifully worn", ar: "الوقت بأناقة" }, hue: 200 },
  { slug: "bags", label: { en: "Ladies Bags", ar: "حقائب نسائية" }, tagline: { en: "Carry your style", ar: "احملي أناقتك" }, hue: 345 },
] as const;
export const MAIN_SLUGS: string[] = MAIN_CATEGORIES.map((c) => c.slug);

/** Smaller shop-by-type categories and brand collections shown under "More" (everything else, e.g. scraper leftovers, stays reachable by URL only). */
const MORE: Record<string, { en: string; ar: string }> = {
  accessories: { en: "Accessories", ar: "إكسسوارات" }, "all-footwear": { en: "Footwear", ar: "أحذية" }, "all-glasses": { en: "Glasses", ar: "نظارات" }, pouches: { en: "Pouches", ar: "حافظات" },
};
const BRANDS: Record<string, string> = { "all-cartier": "Cartier", "all-dior": "Dior", "all-louis-vuitton": "Louis Vuitton", "all-herm-s": "Hermès", "all-goyard": "Goyard", "all-montblanc": "Montblanc" };

export type MenuItem = { slug: string; name: { en: string; ar: string }; image?: string; count: number };
export type Menu = { main: (MenuItem & { tagline: { en: string; ar: string } })[]; more: MenuItem[]; brands: MenuItem[] };

/** Curated navigation: the four lead categories first, then the rest grouped. Counts/images come from the showcase query. */
export function buildMenu(cats: CategoryView[], showcase: Record<string, { image?: string; count: number }>): Menu {
  const has = new Set(cats.map((c) => c.slug));
  const item = (slug: string, name: { en: string; ar: string }): MenuItem => ({ slug, name, image: showcase[slug]?.image, count: showcase[slug]?.count ?? 0 });
  return {
    main: MAIN_CATEGORIES.filter((c) => has.has(c.slug)).map((c) => ({ ...item(c.slug, c.label), tagline: c.tagline })),
    more: Object.entries(MORE).filter(([s]) => has.has(s)).map(([s, n]) => item(s, n)),
    brands: Object.entries(BRANDS).filter(([s]) => has.has(s)).map(([s, n]) => item(s, { en: n, ar: n })),
  };
}
