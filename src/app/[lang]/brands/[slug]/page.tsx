import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { isFiltered, parseFilters } from "@/features/catalog/filters";
import { Listing } from "@/features/catalog/listing";
import { alternatesFor, noIndexIf } from "@/features/catalog/seo";
import { getBrandBySlug } from "@/features/catalog/brands";
import { listProducts } from "@/features/catalog/service";

export async function generateMetadata({ params, searchParams }: PageProps<"/[lang]/brands/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLocale(lang)) return {};
  const b = await getBrandBySlug(slug);
  if (!b) return {};
  return {
    title: b.name,
    description: b.description || (lang === "ar" ? `تسوق ${b.name} في الإمارات.` : `Shop ${b.name} in the UAE.`),
    alternates: alternatesFor(lang, `/brands/${slug}`),
    robots: noIndexIf(isFiltered(parseFilters(await searchParams))),
  };
}

/** A brand's products, whatever their category. Same filters, sorting and paging as a category page. */
export default async function BrandPage({ params, searchParams }: PageProps<"/[lang]/brands/[slug]">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const b = await getBrandBySlug(slug);
  if (!b) notFound();
  const [t, f] = [await getDictionary(lang), parseFilters(await searchParams)];
  const data = await listProducts({ brand: b.name }, f, ["color", "size"]);
  const crumbs = [{ label: t.nav.home, href: `/${lang}` }, { label: lang === "ar" ? "العلامات التجارية" : "Brands", href: `/${lang}/brands` }, { label: b.name }];
  return <Listing locale={lang} t={t} title={b.name} subtitle={b.description || undefined} crumbs={crumbs} path={`/${lang}/brands/${slug}`} f={f} data={data} />;
}
