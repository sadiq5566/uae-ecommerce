import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { fmt } from "@/lib/format";
import { parseFilters } from "@/features/catalog/filters";
import { Listing } from "@/features/catalog/listing";
import { listProducts } from "@/features/catalog/service";

// Internal search results are never indexed.
export async function generateMetadata({ params, searchParams }: PageProps<"/[lang]/search">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const [t, f] = [await getDictionary(lang), parseFilters(await searchParams)];
  return { title: f.q ? fmt(t.catalog.searchFor, { q: f.q }) : t.catalog.searchTitle, robots: { index: false, follow: true } };
}

export default async function SearchPage({ params, searchParams }: PageProps<"/[lang]/search">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const [t, f] = [await getDictionary(lang), parseFilters(await searchParams)];
  const data = await listProducts({}, f);
  const title = f.q ? fmt(t.catalog.searchFor, { q: f.q }) : t.catalog.allProducts;
  return (
    <Listing locale={lang} t={t} title={title} crumbs={[{ label: t.nav.home, href: `/${lang}` }, { label: t.catalog.searchTitle }]} path={`/${lang}/search`} f={f} data={data} hidden={f.q ? { q: f.q } : undefined} />
  );
}
