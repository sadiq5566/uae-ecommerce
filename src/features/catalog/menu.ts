import type { StoreBrand } from "./brands";
import type { CategoryView } from "./service";

/** The categories the shop leads with, in display order. `label` is the customer-facing name (the stored category slug stays "watches" / "bags"). */
export const MAIN_CATEGORIES = [
  { slug: "jewelry", label: { en: "Jewelry", ar: "المجوهرات" }, tagline: { en: "Fine pieces for every day", ar: "قطع راقية لكل يوم" }, hue: 38 },
  { slug: "perfume", label: { en: "Perfume", ar: "العطور" }, tagline: { en: "Signature scents", ar: "عطور مميزة" }, hue: 320 },
  { slug: "watches", label: { en: "Watches", ar: "الساعات" }, tagline: { en: "Time, beautifully worn", ar: "الوقت بأناقة" }, hue: 200 },
  { slug: "bags", label: { en: "Bags", ar: "الحقائب" }, tagline: { en: "Carry your style", ar: "احمل أناقتك" }, hue: 345 },
  { slug: "footwear", label: { en: "Shoes", ar: "الأحذية" }, tagline: { en: "Step out in style", ar: "خطوة بأناقة" }, hue: 15 },
  { slug: "glasses", label: { en: "Glasses", ar: "النظارات" }, tagline: { en: "Sunglasses & frames", ar: "نظارات شمسية وإطارات" }, hue: 215 },
  { slug: "caps", label: { en: "Caps", ar: "القبعات" }, tagline: { en: "Finish the look", ar: "أكمل إطلالتك" }, hue: 25 },
  { slug: "belts", label: { en: "Belts", ar: "الأحزمة" }, tagline: { en: "The detail that completes it", ar: "التفصيل الذي يكمل إطلالتك" }, hue: 30 },
] as const;
export const MAIN_SLUGS: string[] = MAIN_CATEGORIES.map((c) => c.slug);

/** Smaller shop-by-type categories and brand collections shown under "More" (everything else, e.g. scraper leftovers, stays reachable by URL only). */
const MORE: Record<string, { en: string; ar: string }> = {
  accessories: { en: "Accessories", ar: "إكسسوارات" }, pouches: { en: "Pouches", ar: "حافظات" },
};
/** `kind: "brand"` items link to /brands/<slug>; the rest are categories (/c/<slug>). */
export type MenuItem = { slug: string; name: { en: string; ar: string }; image?: string; count: number; kind?: "brand" };
export type Menu = { main: (MenuItem & { tagline: { en: string; ar: string } })[]; more: MenuItem[]; brands: MenuItem[] };

/** Curated navigation: the four lead categories first, then the rest grouped. Counts/images come from the showcase query. */
export function buildMenu(cats: CategoryView[], showcase: Record<string, { image?: string; count: number }>, brands: StoreBrand[] = []): Menu {
  const has = new Set(cats.map((c) => c.slug));
  const item = (slug: string, name: { en: string; ar: string }): MenuItem => ({ slug, name, image: showcase[slug]?.image, count: showcase[slug]?.count ?? 0 });
  return {
    main: MAIN_CATEGORIES.filter((c) => has.has(c.slug)).map((c) => ({ ...item(c.slug, c.label), tagline: c.tagline })),
    more: Object.entries(MORE).filter(([s]) => has.has(s)).map(([s, n]) => item(s, n)),
    brands: brands.slice(0, 14).map((b) => ({ slug: b.slug, name: { en: b.name, ar: b.name }, image: b.image || b.logo || undefined, count: b.count, kind: "brand" as const })),
  };
}
