import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/i18n";
import type { CategoryView, Facets } from "./service";
import type { Filters } from "./filters";

const input = "w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-brand";
const legend = "mb-2 text-sm font-semibold";

/** GET form: works without JS and keeps every filter in shareable URL params. */
export function FiltersForm({ id, action, t, locale, f, facets, category, hidden }: {
  id: string; action: string; t: Dictionary; locale: Locale; f: Filters; facets: Facets; category?: CategoryView; hidden?: Record<string, string>;
}) {
  return (
    <form action={action} method="get" className="flex flex-col gap-6" id={id}>
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {f.sort !== "relevance" && <input type="hidden" name="sort" value={f.sort} />}
      <fieldset>
        <legend className={legend}>{t.catalog.price}</legend>
        <div className="flex items-center gap-2">
          <input name="minPrice" type="number" min={0} inputMode="numeric" placeholder={`${t.catalog.min} ${facets.price.min || ""}`} defaultValue={f.minPrice} aria-label={t.catalog.min} className={input} />
          <span aria-hidden>–</span>
          <input name="maxPrice" type="number" min={0} inputMode="numeric" placeholder={`${t.catalog.max} ${facets.price.max || ""}`} defaultValue={f.maxPrice} aria-label={t.catalog.max} className={input} />
        </div>
      </fieldset>
      {facets.brands.length > 0 && (
        <fieldset>
          <legend className={legend}>{t.catalog.brand}</legend>
          <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto pe-1">
            {facets.brands.map((b) => (
              <label key={b.value} className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" name="brand" value={b.value} defaultChecked={f.brand.includes(b.value)} className="size-4 accent-[var(--brand)]" />{b.value}<span className="ms-auto text-xs text-muted">{b.count}</span></label>
            ))}
          </div>
        </fieldset>
      )}
      {category?.attributes.map((a) => (facets.attrs[a.key]?.length ?? 0) > 1 && (
        <fieldset key={a.key}>
          <legend className={legend}>{a.label[locale]}</legend>
          <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto pe-1">
            {facets.attrs[a.key].map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" name={`attr.${a.key}`} value={o.value} defaultChecked={f.attrs[a.key]?.includes(o.value)} className="size-4 accent-[var(--brand)]" />{o.value}<span className="ms-auto text-xs text-muted">{o.count}</span></label>
            ))}
          </div>
        </fieldset>
      ))}
      <fieldset>
        <legend className={legend}>{t.catalog.rating}</legend>
        <div className="flex flex-col gap-1.5">
          {[4, 3, 2].map((r) => (
            <label key={r} className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" name="rating" value={r} defaultChecked={f.rating === r} className="size-4 accent-[var(--brand)]" /><span className="text-gold-ink">{"★".repeat(r)}</span> {t.catalog.andUp}</label>
          ))}
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" name="rating" value="" defaultChecked={!f.rating} className="size-4 accent-[var(--brand)]" />—</label>
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" name="inStock" value="1" defaultChecked={f.inStock} className="size-4 accent-[var(--brand)]" />{t.catalog.inStockOnly}</label>
        <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" name="onSale" value="1" defaultChecked={f.onSale} className="size-4 accent-[var(--brand)]" />{t.catalog.onSaleOnly}</label>
      </div>
      <div className="flex gap-2">
        <button className="flex-1 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg transition hover:brightness-110 active:scale-95">{t.catalog.apply}</button>
        <a href={action + (hidden?.q ? `?q=${encodeURIComponent(hidden.q)}` : "")} className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium hover:bg-surface-2">{t.catalog.clear}</a>
      </div>
    </form>
  );
}
