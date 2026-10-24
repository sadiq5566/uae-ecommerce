import type { Metadata } from "next";
import Image from "@/components/img";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { Breadcrumbs } from "@/features/catalog/breadcrumbs";
import { alternatesFor } from "@/features/catalog/seo";
import { getStoreBrands } from "@/features/catalog/brands";

export async function generateMetadata({ params }: PageProps<"/[lang]/brands">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  return { title: lang === "ar" ? "العلامات التجارية" : "Brands", alternates: alternatesFor(lang, "/brands") };
}

export default async function BrandsPage({ params }: PageProps<"/[lang]/brands">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const [t, brands] = await Promise.all([getDictionary(lang), getStoreBrands()]);
  const ar = lang === "ar";
  const featured = brands.filter((b) => b.isFeatured).slice(0, 8);
  const letters = [...new Set(brands.map((b) => b.name[0].toUpperCase()))].sort();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs label={t.catalog.breadcrumb} items={[{ label: t.nav.home, href: `/${lang}` }, { label: ar ? "العلامات التجارية" : "Brands" }]} />
      <h1 className="mt-4 font-display text-3xl font-bold sm:text-4xl">{ar ? "العلامات التجارية" : "Brands"}</h1>
      {featured.length > 0 && (
        <ul className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {featured.map((b) => (
            <li key={b.slug}>
              <Link href={`/${lang}/brands/${b.slug}`} className="group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-surface-2">
                {b.image && <Image src={b.image} alt="" fill sizes="(min-width:768px) 25vw, 50vw" className="object-cover transition duration-500 group-hover:scale-105" />}
                <span className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-4 text-white"><span className="block font-display text-xl font-bold">{b.name}</span><span className="text-xs text-white/80">{b.count}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-10 space-y-8">
        {letters.map((l) => (
          <section key={l} aria-labelledby={`b-${l}`}>
            <h2 id={`b-${l}`} className="mb-3 font-display text-2xl font-bold text-brand">{l}</h2>
            <ul className="grid grid-cols-2 gap-x-6 sm:grid-cols-3 lg:grid-cols-4">
              {brands.filter((b) => b.name[0].toUpperCase() === l).map((b) => (
                <li key={b.slug}><Link href={`/${lang}/brands/${b.slug}`} className="flex items-baseline justify-between gap-2 border-b border-line py-2 hover:text-brand"><span>{b.name}</span><span className="text-xs text-muted">{b.count}</span></Link></li>
              ))}
            </ul>
          </section>
        ))}
        {brands.length === 0 && <p className="py-16 text-center text-muted">{ar ? "قريباً" : "Brands are on their way."}</p>}
      </div>
    </div>
  );
}
