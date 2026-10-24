import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { isFiltered, parseFilters } from "@/features/catalog/filters";
import { Listing } from "@/features/catalog/listing";
import { alternatesFor, noIndexIf } from "@/features/catalog/seo";
import { findSlugRedirect, getCategoryBySlug, listProducts } from "@/features/catalog/service";

export async function generateMetadata({ params, searchParams }: PageProps<"/[lang]/c/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLocale(lang)) return {};
  const found = await getCategoryBySlug(slug);
  if (!found) return {};
  const { cat } = found;
  const f = parseFilters(await searchParams);
  return {
    title: cat.seo?.title?.[lang] ?? cat.name[lang],
    description: cat.seo?.description?.[lang] || cat.description?.[lang] || `${cat.name[lang]} — ${(await getDictionary(lang)).hero.subtitle}`,
    alternates: alternatesFor(lang, `/c/${slug}`),
    robots: noIndexIf(isFiltered(f)),
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/[lang]/c/[slug]">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const found = await getCategoryBySlug(slug);
  if (!found) {
    const moved = await findSlugRedirect("category", slug);
    if (moved) permanentRedirect(`/${lang}/c/${moved}`);
    notFound();
  }
  const { cat, children, parent, scopeIds } = found;
  const [t, f] = [await getDictionary(lang), parseFilters(await searchParams)];
  const data = await listProducts({ categoryIds: scopeIds }, f, cat.attributes.map((a) => a.key));
  const crumbs = [
    { label: t.nav.home, href: `/${lang}` },
    ...(parent ? [{ label: parent.name[lang], href: `/${lang}/c/${parent.slug}` }] : []),
    { label: cat.name[lang] },
  ];
  return (
    <Listing locale={lang} t={t} title={cat.name[lang]} subtitle={cat.description?.[lang]} crumbs={crumbs} path={`/${lang}/c/${slug}`} f={f} data={data} category={cat}>
      {children.length > 0 && (
        <nav aria-label={t.catalog.subcategories} className="mt-5 flex flex-wrap gap-2">
          {children.map((c) => (
            <Link key={c.slug} href={`/${lang}/c/${c.slug}`} className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5 hover:border-brand hover:text-brand">
              <span aria-hidden className="relative grid size-6 place-items-center overflow-hidden rounded-full">{c.image ? <Image src={c.image} alt="" fill sizes="24px" className="object-cover" /> : c.icon}</span>{c.name[lang]}
            </Link>
          ))}
        </nav>
      )}
    </Listing>
  );
}
