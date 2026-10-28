import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n";
import { HREFLANG } from "@/features/catalog/seo";
import { getSitemapEntries } from "@/features/catalog/service";
import { getSitemapContent } from "@/features/content/service";
import { getStoreBrands } from "@/features/catalog/brands";
import { absolute } from "@/lib/email";

export const revalidate = 3600;

/** Next writes image URLs into the XML as-is, so a query string like `?v=1&width=960` must have its `&` escaped or Google rejects the file. */
const xmlSafe = (u?: string) => u?.replace(/&(?!amp;)/g, "&amp;");

type Freq = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
type Opts = { lastModified?: Date; priority: number; changeFrequency: Freq; image?: string };

/**
 * One <url> per language version, each listing both languages (hreflang en-AE / ar-AE + x-default), so Google pairs the UAE English and
 * Arabic pages. Product entries carry their main image for Google Images. A sitemap file may hold 50,000 URLs; the catalogue is far below.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const entries = (path: string, o: Opts): MetadataRoute.Sitemap => locales.map((l) => ({
    url: `${base}/${l}${path}`, lastModified: o.lastModified, changeFrequency: o.changeFrequency, priority: o.priority,
    alternates: { languages: { ...Object.fromEntries(locales.map((x) => [HREFLANG[x], `${base}/${x}${path}`])), "x-default": `${base}/en${path}` } },
    ...(o.image && { images: [o.image] }),
  }));
  const now = new Date();
  let dynamic: MetadataRoute.Sitemap = [];
  try {
    const { products, categories } = await getSitemapEntries();
    dynamic = [
      ...categories.flatMap((s) => entries(`/c/${s}`, { lastModified: now, priority: 0.9, changeFrequency: "daily" })),
      ...(await getStoreBrands()).flatMap((b) => entries(`/brands/${b.slug}`, { lastModified: now, priority: 0.7, changeFrequency: "weekly" })),
      ...products.flatMap((p) => entries(`/p/${p.slug}`, { lastModified: p.updatedAt, priority: 0.8, changeFrequency: "weekly", image: xmlSafe(absolute(p.image)) })),
    ];
    const { articles, pages } = await getSitemapContent();
    dynamic.push(
      ...articles.flatMap((a) => entries(`/journal/${a.slug}`, { lastModified: a.updatedAt, priority: 0.6, changeFrequency: "monthly" })),
      ...pages.flatMap((p) => entries(`/${p}`, { priority: 0.3, changeFrequency: "yearly" })),
    );
  } catch { /* DB unavailable: still serve static entries */ }
  return [
    ...entries("", { lastModified: now, priority: 1, changeFrequency: "daily" }),
    ...entries("/deals", { lastModified: now, priority: 0.9, changeFrequency: "daily" }),
    ...entries("/new", { lastModified: now, priority: 0.9, changeFrequency: "daily" }),
    ...entries("/offers", { lastModified: now, priority: 0.7, changeFrequency: "weekly" }),
    ...entries("/brands", { lastModified: now, priority: 0.7, changeFrequency: "weekly" }),
    ...entries("/journal", { lastModified: now, priority: 0.5, changeFrequency: "weekly" }),
    ...dynamic,
  ];
}
