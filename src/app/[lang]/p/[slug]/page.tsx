import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { REVIEW_SORTS, type ReviewSort } from "@/features/reviews/service";
import { ReviewsSection } from "@/features/reviews/reviews-section";
import { isLocale } from "@/lib/i18n";
import { ProductCard } from "@/components/product-card";
import { ViewTracker } from "@/components/view-tracker";
import { Gallery } from "@/features/catalog/gallery";
import { Breadcrumbs } from "@/features/catalog/breadcrumbs";
import { ProductBuy } from "@/features/catalog/product-buy";
import { alternatesFor } from "@/features/catalog/seo";
import { findSlugRedirect, getCategories, getProductBySlug, getRelated } from "@/features/catalog/service";

export async function generateMetadata({ params }: PageProps<"/[lang]/p/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLocale(lang)) return {};
  const p = await getProductBySlug(slug);
  if (!p) return {};
  const desc = p.seo?.description?.[lang] ?? p.description[lang];
  return {
    title: p.seo?.title?.[lang] ?? p.name[lang], description: desc?.slice(0, 160), alternates: alternatesFor(lang, `/p/${slug}`),
    openGraph: { title: p.name[lang], description: desc?.slice(0, 160), type: "website", images: p.image ? [p.image] : undefined },
  };
}

export default async function ProductPage({ params, searchParams }: PageProps<"/[lang]/p/[slug]">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const p = await getProductBySlug(slug);
  if (!p) {
    const moved = await findSlugRedirect("product", slug);
    if (moved) permanentRedirect(`/${lang}/p/${moved}`);
    notFound();
  }
  const sp = await searchParams;
  const rsort = (REVIEW_SORTS as readonly string[]).includes(String(sp.rsort)) ? (sp.rsort as ReviewSort) : "helpful";
  const rpage = Math.min(50, Math.max(1, Number(sp.rpage) || 1));
  const [t, related, cats] = await Promise.all([getDictionary(lang), getRelated(p), getCategories()]);
  const cat = cats.find((c) => c.id === p.category);
  const parent = cat?.parent ? cats.find((c) => c.id === cat.parent) : undefined;
  const crumbs = [
    { label: t.nav.home, href: `/${lang}` },
    ...(parent ? [{ label: parent.name[lang], href: `/${lang}/c/${parent.slug}` }] : []),
    ...(cat ? [{ label: cat.name[lang], href: `/${lang}/c/${cat.slug}` }] : []),
    { label: p.name[lang] },
  ];
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  // Structured data mirrors what is visible on the page. No aggregateRating until real reviews exist (Phase 5).
  const jsonLd = [
    {
      "@context": "https://schema.org", "@type": "Product", name: p.name[lang], sku: p.sku, description: p.description[lang],
      ...(p.brand && { brand: { "@type": "Brand", name: p.brand } }),
      ...(p.image && { image: p.image }),
      // aggregateRating only when approved reviews exist and are shown on this page.
      ...(p.ratingCount > 0 && { aggregateRating: { "@type": "AggregateRating", ratingValue: p.ratingAvg, reviewCount: p.ratingCount } }),
      offers: { "@type": "Offer", url: `${base}/${lang}/p/${p.slug}`, priceCurrency: "AED", price: p.finalPrice, availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" },
    },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, ...(c.href && { item: `${base}${c.href}` }) })) },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <ViewTracker id={p.id} />
      <Breadcrumbs label={t.catalog.breadcrumb} items={crumbs} />
      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <div className="animate-fade-up"><Gallery images={p.images} name={p.name[lang]} locale={lang} icon={p.icon} hue={p.hue} labels={{ thumb: t.catalog.thumb }} /></div>
        <div className="animate-fade-up flex flex-col gap-6 [animation-delay:120ms]">
          <div>
            {p.brand && <p className="text-sm font-semibold text-brand">{p.brand}</p>}
            <h1 className="mt-1 font-display text-3xl font-bold leading-tight sm:text-4xl">{p.name[lang]}</h1>
            <p className="mt-2 text-sm text-muted">
              {p.ratingCount > 0 ? <><span className="text-gold">★</span> {p.ratingAvg.toFixed(1)} ({p.ratingCount} {t.product.reviews}) · </> : null}
              {t.catalog.sku}: {p.sku}
            </p>
          </div>
          <ProductBuy p={p} locale={lang} t={t} />
          <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
            <p className="font-semibold">🚚 {t.catalog.delivery}</p>
            <p className="mt-1 text-muted">{t.catalog.deliveryInfo}</p>
          </div>
        </div>
      </div>

      <div className="mt-14 grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="font-display text-xl font-bold">{t.catalog.description}</h2>
          <p className="mt-3 leading-relaxed text-muted">{p.description[lang]}</p>
        </section>
        {p.specs.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-bold">{t.catalog.specs}</h2>
            <dl className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
              {p.specs.map((s, i) => <div key={i} className="flex justify-between gap-4 px-4 py-3 text-sm"><dt className="text-muted">{s.label[lang]}</dt><dd className="font-medium">{s.value[lang]}</dd></div>)}
            </dl>
          </section>
        )}
      </div>
      <ReviewsSection productId={p.id} slug={p.slug} locale={lang} t={t} sort={rsort} page={rpage} />
      {related.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-6 font-display text-2xl font-bold">{t.catalog.related}</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{related.map((r) => <ProductCard key={r.id} p={r} locale={lang} t={t} />)}</div>
        </section>
      )}
    </div>
  );
}
