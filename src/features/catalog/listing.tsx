import Link from "next/link";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/i18n";
import { fmt } from "@/lib/format";
import { ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";
import { Breadcrumbs, type Crumb } from "./breadcrumbs";
import { FilterDialog } from "./filter-dialog";
import { FiltersForm } from "./filters-form";
import { toQuery, type Filters } from "./filters";
import { SortSelect } from "./sort-select";
import type { CategoryView, Facets, ProductCardData } from "./service";

export function Listing({ locale, t, title, subtitle, crumbs, path, f, data, category, children, hidden }: {
  locale: Locale; t: Dictionary; title: string; subtitle?: string; crumbs: Crumb[]; path: string; f: Filters;
  data: { items: ProductCardData[]; total: number; pages: number; facets: Facets }; category?: CategoryView; children?: React.ReactNode; hidden?: Record<string, string>;
}) {
  const form = (id: string) => <FiltersForm id={id} action={path} t={t} locale={locale} f={f} facets={data.facets} category={category} hidden={hidden} />;
  const page = Math.min(f.page, data.pages);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs label={t.catalog.breadcrumb} items={crumbs} />
      <header className="animate-fade-up mt-4">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </header>
      {children}
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <aside className="hidden lg:block" aria-label={t.catalog.filters}><div className="sticky top-32 rounded-2xl border border-line bg-surface p-5">{form("filters-desktop")}</div></aside>
        <section aria-live="polite">
          <h2 className="sr-only">{fmt(t.catalog.results, { n: data.total })}</h2>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">{fmt(t.catalog.results, { n: data.total })}</p>
            <div className="flex items-center gap-2">
              <FilterDialog label={t.catalog.filters} close={t.nav.close}>{form("filters-mobile")}</FilterDialog>
              <SortSelect value={f.sort} label={t.catalog.sort} options={t.catalog.sorts} />
            </div>
          </div>
          {data.items.length === 0 ? (
            <div className="grid place-items-center gap-3 rounded-2xl border border-dashed border-line py-20 text-center">
              <p className="text-5xl">🔎</p>
              <h2 className="font-display text-xl font-bold">{t.catalog.noResults}</h2>
              <p className="max-w-sm text-sm text-muted">{t.catalog.noResultsHint}</p>
              <Link href={path} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-fg">{t.catalog.clear}</Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {data.items.map((p, i) => <Reveal key={p.id} delay={(i % 3) * 70}><ProductCard p={p} locale={locale} t={t} /></Reveal>)}
            </div>
          )}
          {data.pages > 1 && (
            <nav aria-label={t.catalog.pagination} className="mt-10 flex items-center justify-center gap-3 text-sm">
              {page > 1 ? <Link rel="prev" href={`${path}${toQuery(f, { page: page - 1 })}`} className="rounded-full border border-line px-4 py-2 hover:border-brand">← {t.catalog.prev}</Link> : <span />}
              <span className="text-muted">{fmt(t.catalog.page, { p: page, n: data.pages })}</span>
              {page < data.pages ? <Link rel="next" href={`${path}${toQuery(f, { page: page + 1 })}`} className="rounded-full border border-line px-4 py-2 hover:border-brand">{t.catalog.next} →</Link> : <span />}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
