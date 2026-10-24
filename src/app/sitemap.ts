import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n";
import { getSitemapEntries } from "@/features/catalog/service";
import { getSitemapContent } from "@/features/content/service";
import { getStoreBrands } from "@/features/catalog/brands";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const entry = (path: string, lastModified?: Date) => ({
    url: `${base}/${locales[0]}${path}`, lastModified,
    alternates: { languages: Object.fromEntries(locales.map((l) => [l, `${base}/${l}${path}`])) },
  });
  let dynamic: MetadataRoute.Sitemap = [];
  try {
    const { products, categories } = await getSitemapEntries();
    dynamic = [...categories.map((s) => entry(`/c/${s}`)), ...products.map((p) => entry(`/p/${p.slug}`, p.updatedAt))];
    dynamic.push(...(await getStoreBrands()).map((b) => entry(`/brands/${b.slug}`)));
    const { articles, pages } = await getSitemapContent();
    dynamic.push(...articles.map((a) => entry(`/journal/${a.slug}`, a.updatedAt)), ...pages.map((p) => entry(`/${p}`)));
  } catch { /* DB unavailable: still serve static entries */ }
  return [entry(""), entry("/brands"), entry("/deals"), entry("/offers"), entry("/new"), entry("/journal"), ...dynamic];
}
