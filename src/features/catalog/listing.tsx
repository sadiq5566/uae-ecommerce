import Link from "next/link";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/i18n";
import { fmt } from "@/lib/format";
import { ProductCard } from "@/components/product-card";
import { Breadcrumbs, type Crumb } from "./breadcrumbs";
import { FilterDialog } from "./filter-dialog";
import { FiltersForm } from "./filters-form";
import { PAGE_SIZE, PAGE_SIZES, toQuery, type Filters } from "./filters";
import { ParamSelect } from "./param-select";
import { SortSelect } from "./sort-select";
import type { CategoryView, Facets, ProductCardData } from "./service";

/** 1 … 4 5 6 … 20: always the first and last page, and two either side of the current one. */
function pageList(page: number, pages: number): (number | "…")[] {
  const keep = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter((n) => n >= 1 && n <= pages));
  const out: (number | "…")[] = [];
  [...keep].sort((a, b) => a - b).forEach((n, i, all) => { if (i && n - all[i - 1] > 1) out.push("…"); out.push(n); });
  return out;
}

export function Listing({ locale, t, title, subtitle, crumbs, path, f, data, category, children, hidden }: {
  locale: Locale; t: Dictionary; title: string; subtitle?: string; crumbs: Crumb[]; path: string; f: Filters;
  data: { items: ProductCardData[]; total: number; pages: number; facets: Facets }; category?: CategoryView; children?: React.ReactNode; hidden?: Record<string, string>;
}) {
  const form = (id: string) => <FiltersForm id={id} action={path} t={t} locale={locale} f={f} facets={data.facets} category={category} hidden={hidden} />;
  const page = Math.min(f.page, data.pages);
  const url = (o: Partial<Filters>) => `${path}${toQuery(f, { page: 1, ...o })}`;
  const from = data.total ? (page - 1) * f.per + 1 : 0, to = Math.min(data.total, page * f.per);
  const money = (n: number) => `AED ${n}`;
  // One removable chip per active filter, so the customer sees exactly what is narrowing the list and can drop it with one tap.
  const chips: { key: string; label: string; href: string }[] = [
    ...f.brand.map((b) => ({ key: `b-${b}`, label: b, href: url({ brand: f.brand.filter((x) => x !== b) }) })),
    ...(f.minPrice != null || f.maxPrice != null ? [{ key: "price", label: f.minPrice != null && f.maxPrice != null ? `${money(f.minPrice)} – ${money(f.maxPrice)}` : f.maxPrice != null ? fmt(t.catalog.under, { n: money(f.maxPrice) }) : fmt(t.catalog.over, { n: money(f.minPrice!) }), href: url({ minPrice: undefined, maxPrice: undefined }) }] : []),
    ...(f.rating ? [{ key: "rating", label: fmt(t.catalog.ratingChip, { n: f.rating }), href: url({ rating: undefined }) }] : []),
    ...(f.inStock ? [{ key: "stock", label: t.catalog.inStockOnly, href: url({ inStock: false }) }] : []),
    ...(f.onSale ? [{ key: "sale", label: t.catalog.onSaleOnly, href: url({ onSale: false }) }] : []),
    ...Object.entries(f.attrs).flatMap(([k, vs]) => vs.map((v) => ({ key: `a-${k}-${v}`, label: v, href: url({ attrs: { ...f.attrs, [k]: vs.filter((x) => x !== v) } }) }))),
  ];
  const perOptions = PAGE_SIZES.map((n) => ({ value: String(n), label: fmt(t.catalog.perPageOption, { n }) }));
  const perSelect = <ParamSelect param="per" value={String(f.per)} defaultValue={String(PAGE_SIZE)} options={perOptions} label={t.catalog.perPage} />;
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
            <p className="text-sm text-muted">{data.total > f.per ? fmt(t.catalog.showing, { from, to, n: data.total }) : fmt(t.catalog.results, { n: data.total })}</p>
            <div className="flex flex-wrap items-center gap-2">
              <FilterDialog label={`${t.catalog.filters}${chips.length ? ` (${chips.length})` : ""}`} close={t.nav.close}>{form("filters-mobile")}</FilterDialog>
              <SortSelect value={f.sort} label={t.catalog.sort} options={t.catalog.sorts} />
              {data.total > PAGE_SIZE && perSelect}
            </div>
          </div>
          {chips.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-2" aria-label={t.catalog.activeFilters}>
              {chips.map((c) => <Link key={c.key} href={c.href} scroll={false} className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand transition hover:bg-brand/20">{c.label}<span aria-hidden>✕</span><span className="sr-only">{t.nav.close}</span></Link>)}
              <Link href={`${path}${f.q ? `?q=${encodeURIComponent(f.q)}` : ""}`} scroll={false} className="px-2 text-xs font-semibold text-muted underline hover:text-danger">{t.catalog.clear}</Link>
            </div>
          )}
          {data.items.length === 0 ? (
            <div className="grid place-items-center gap-3 rounded-2xl border border-dashed border-line py-20 text-center">
              <p className="text-5xl">🔎</p>
              <h2 className="font-display text-xl font-bold">{t.catalog.noResults}</h2>
              <p className="max-w-sm text-sm text-muted">{t.catalog.noResultsHint}</p>
              <Link href={path} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-fg">{t.catalog.clear}</Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {data.items.map((p, i) => <ProductCard key={p.id} p={p} locale={locale} t={t} priority={i < 4} />)}
            </div>
          )}
          {data.pages > 1 && (
            <nav aria-label={t.catalog.pagination} className="mt-10 flex flex-col items-center gap-4 text-sm">
              <ul className="flex flex-wrap items-center justify-center gap-1.5">
                <li>{page > 1 ? <Link rel="prev" href={url({ page: page - 1 })} aria-label={t.catalog.prev} className="grid h-10 min-w-10 place-items-center rounded-full border border-line px-3 hover:border-brand"><span className="flip-rtl">←</span></Link> : null}</li>
                {pageList(page, data.pages).map((n, i) => n === "…" ? <li key={`e${i}`} aria-hidden className="px-1 text-muted">…</li> : (
                  <li key={n}><Link href={url({ page: n })} aria-current={n === page ? "page" : undefined} className={`grid h-10 min-w-10 place-items-center rounded-full px-3 font-medium transition ${n === page ? "bg-brand text-brand-fg" : "border border-line hover:border-brand hover:text-brand"}`}>{n}</Link></li>
                ))}
                <li>{page < data.pages ? <Link rel="next" href={url({ page: page + 1 })} aria-label={t.catalog.next} className="grid h-10 min-w-10 place-items-center rounded-full border border-line px-3 hover:border-brand"><span className="flip-rtl">→</span></Link> : null}</li>
              </ul>
              <div className="flex flex-wrap items-center justify-center gap-3 text-muted"><span>{fmt(t.catalog.showing, { from, to, n: data.total })}</span>{perSelect}</div>
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
