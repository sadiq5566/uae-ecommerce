import { LiveForm } from "@/components/live-form";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/i18n";
import type { CategoryView, Facets } from "./service";
import { PAGE_SIZE, toQuery, type Filters } from "./filters";
import { fmt } from "@/lib/format";

const input = "w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-brand";
const legend = "cursor-pointer list-none text-sm font-semibold marker:hidden [&::-webkit-details-marker]:hidden";
const RANGES: [number, number | undefined][] = [[0, 50], [50, 100], [100, 200], [200, 500], [500, undefined]];

/** One collapsible filter group; the badge shows how many choices are active so a closed group still tells you something is applied. */
function Group({ title, active = 0, open = true, children }: { title: string; active?: number; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open || active > 0} className="group border-b border-line pb-4 last:border-0">
      <summary className={`${legend} flex items-center justify-between`}>
        <span>{title}{active > 0 && <span className="ms-2 rounded-full bg-brand px-2 py-0.5 text-xs text-brand-fg">{active}</span>}</span>
        <span aria-hidden className="text-muted transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/** GET form: works without JS and keeps every filter in shareable URL params. */
export function FiltersForm({ id, action, t, locale, f, facets, category, hidden }: {
  id: string; action: string; t: Dictionary; locale: Locale; f: Filters; facets: Facets; category?: CategoryView; hidden?: Record<string, string>;
}) {
  return (
    <LiveForm action={action} className="flex flex-col gap-6" id={id}>
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {f.sort !== "relevance" && <input type="hidden" name="sort" value={f.sort} />}
      {f.per !== PAGE_SIZE && <input type="hidden" name="per" value={f.per} />}
      <Group title={t.catalog.price} active={f.minPrice != null || f.maxPrice != null ? 1 : 0}>
        <div className="mb-3 flex flex-wrap gap-1.5" aria-label={t.catalog.quickPrice}>
          {RANGES.map(([lo, hi]) => {
            const on = (f.minPrice ?? 0) === lo && f.maxPrice === hi;
            return <a key={lo} href={`${action}${toQuery(f, { minPrice: lo || undefined, maxPrice: hi, page: 1 })}`} aria-current={on} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${on ? "border-brand bg-brand text-brand-fg" : "border-line hover:border-brand hover:text-brand"}`}>{hi == null ? fmt(t.catalog.over, { n: lo }) : lo === 0 ? fmt(t.catalog.under, { n: hi }) : `${lo}–${hi}`}</a>;
          })}
        </div>
        <div className="flex items-center gap-2">
          <input name="minPrice" type="number" min={0} inputMode="numeric" placeholder={`${t.catalog.min} ${facets.price.min || ""}`} defaultValue={f.minPrice} aria-label={t.catalog.min} className={input} />
          <span aria-hidden>–</span>
          <input name="maxPrice" type="number" min={0} inputMode="numeric" placeholder={`${t.catalog.max} ${facets.price.max || ""}`} defaultValue={f.maxPrice} aria-label={t.catalog.max} className={input} />
        </div>
      </Group>
      {facets.brands.length > 0 && (
        <Group title={t.catalog.brand} active={f.brand.length}>
          <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto pe-1">
            {facets.brands.map((b) => (
              <label key={b.value} className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" name="brand" value={b.value} defaultChecked={f.brand.includes(b.value)} className="size-4 accent-[var(--brand)]" />{b.value}<span className="ms-auto text-xs text-muted">{b.count}</span></label>
            ))}
          </div>
        </Group>
      )}
      {category?.attributes.map((a) => (facets.attrs[a.key]?.length ?? 0) > 1 && (
        <Group key={a.key} title={a.label[locale]} active={f.attrs[a.key]?.length ?? 0}>
          <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto pe-1">
            {facets.attrs[a.key].map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" name={`attr.${a.key}`} value={o.value} defaultChecked={f.attrs[a.key]?.includes(o.value)} className="size-4 accent-[var(--brand)]" />{o.value}<span className="ms-auto text-xs text-muted">{o.count}</span></label>
            ))}
          </div>
        </Group>
      ))}
      <Group title={t.catalog.rating} active={f.rating ? 1 : 0}>
        <div className="flex flex-col gap-1.5">
          {[4, 3, 2].map((r) => (
            <label key={r} className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" name="rating" value={r} defaultChecked={f.rating === r} className="size-4 accent-[var(--brand)]" /><span className="text-gold-ink">{"★".repeat(r)}</span> {t.catalog.andUp}</label>
          ))}
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" name="rating" value="" defaultChecked={!f.rating} className="size-4 accent-[var(--brand)]" />—</label>
        </div>
      </Group>
      <div className="flex flex-col gap-1.5">
        <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" name="inStock" value="1" defaultChecked={f.inStock} className="size-4 accent-[var(--brand)]" />{t.catalog.inStockOnly}</label>
        <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" name="onSale" value="1" defaultChecked={f.onSale} className="size-4 accent-[var(--brand)]" />{t.catalog.onSaleOnly}</label>
      </div>
      <div className="flex gap-2">
        <button className="sr-only">{t.catalog.apply}</button>{/* Enter still submits; filters apply as soon as they change */}
        <a href={action + (hidden?.q ? `?q=${encodeURIComponent(hidden.q)}` : "")} className="flex-1 rounded-xl border border-line px-4 py-2.5 text-center text-sm font-medium hover:bg-surface-2">{t.catalog.clear}</a>
      </div>
    </LiveForm>
  );
}
