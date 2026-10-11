import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { isFiltered, parseFilters } from "@/features/catalog/filters";
import { Listing } from "@/features/catalog/listing";
import { alternatesFor, noIndexIf } from "@/features/catalog/seo";
import { listProducts } from "@/features/catalog/service";

export async function generateMetadata({ params, searchParams }: PageProps<"/[lang]/deals">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = await getDictionary(lang);
  return { title: t.catalog.dealsTitle, description: t.catalog.dealsSub, alternates: alternatesFor(lang, "/deals"), robots: noIndexIf(isFiltered(parseFilters(await searchParams))) };
}

export default async function Page({ params, searchParams }: PageProps<"/[lang]/deals">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const [t, f] = [await getDictionary(lang), parseFilters(await searchParams)];
  const data = await listProducts({ deals: true }, f);
  return <Listing locale={lang} t={t} title={t.catalog.dealsTitle} subtitle={t.catalog.dealsSub} crumbs={[{ label: t.nav.home, href: `/${lang}` }, { label: t.catalog.dealsTitle }]} path={`/${lang}/deals`} f={f} data={data} />;
}
