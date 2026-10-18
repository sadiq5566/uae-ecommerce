import Link from "next/link";
import { PAGE_SIZES, listHref } from "@/lib/admin/list";
import { btnGhost, btnPrimary, inputCls } from "./ui";

export type FilterField = {
  name: string; label: string; kind: "search" | "select" | "date" | "number";
  options?: { value: string; label: string }[]; placeholder?: string; more?: boolean; // more = inside "More filters"
};
export type SortOption = { value: string; label: string };

type Common = { base: string; values: Record<string, string>; sort: string; dir: "asc" | "desc"; per?: number; defaultSort: string; defaultDir?: "asc" | "desc"; defaultPer?: number; sk?: string; dk?: string; pk?: string; keep?: Record<string, string> };

/** URL for this list with some params replaced (page is reset unless given). */
export function hrefFor(c: Common, over: Record<string, string | number | undefined> = {}) {
  const sk = c.sk ?? "sort", dk = c.dk ?? "dir", pk = c.pk ?? "per";
  const o = { ...over };
  if ("sort" in o) { o[sk] = o.sort; delete o.sort; }
  if ("dir" in o) { o[dk] = o.dir; delete o.dir; }
  const p = { ...c.keep, ...c.values, [sk]: c.sort, [dk]: c.dir, [pk]: c.per, ...o };
  return listHref(c.base, p, { [sk]: c.defaultSort, [dk]: c.defaultDir ?? "desc", [pk]: c.defaultPer ?? 25 });
}

/** Clickable column header: click to sort ascending, click again for descending. */
export function SortHead({ label, field, ...c }: { label: string; field: string } & Common) {
  const on = c.sort === field;
  const next = on && c.dir === "asc" ? "desc" : "asc";
  return (
    <Link href={hrefFor(c, { sort: field, dir: next, page: undefined })} scroll={false} aria-label={`Sort by ${label}${on ? `, currently ${c.dir === "asc" ? "ascending" : "descending"}` : ""}`}
      className={`inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-wide hover:text-brand ${on ? "text-brand" : ""}`}>
      {label}<span aria-hidden className={on ? "" : "opacity-30"}>{on ? (c.dir === "asc" ? "▲" : "▼") : "↕"}</span>
    </Link>
  );
}

/** Search + dropdown + date/number filters, sorting and page size, with removable chips for whatever is active. GET form: everything lives in the URL. */
export function FilterForm({ fields, sorts, sizes = true, ...c }: { fields: FilterField[]; sorts?: SortOption[]; sizes?: boolean } & Common) {
  const sk = c.sk ?? "sort", dk = c.dk ?? "dir", pk = c.pk ?? "per";
  const sel = `${inputCls} !w-auto`;
  const control = (f: FilterField) => {
    const v = c.values[f.name] ?? "";
    if (f.kind === "select") return <select key={f.name} name={f.name} defaultValue={v} aria-label={f.label} className={sel}><option value="">{f.label}: all</option>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
    if (f.kind === "search") return <input key={f.name} name={f.name} defaultValue={v} placeholder={f.placeholder ?? f.label} aria-label={f.label} className={`${inputCls} max-w-xs`} />;
    return (
      <label key={f.name} className="text-xs font-medium text-muted">{f.label}
        <input type={f.kind} name={f.name} defaultValue={v} min={f.kind === "number" ? 0 : undefined} step={f.kind === "number" ? "0.01" : undefined} placeholder={f.placeholder} className={`${inputCls} mt-1 block !w-36`} />
      </label>
    );
  };
  const main = fields.filter((f) => !f.more);
  const more = fields.filter((f) => f.more);
  const active = fields.filter((f) => c.values[f.name]);
  const chipText = (f: FilterField) => { const v = c.values[f.name]; return f.kind === "select" ? f.options?.find((o) => o.value === v)?.label ?? v : `${f.label}: ${v}`; };
  const changed = active.length > 0 || c.sort !== c.defaultSort || (c.per ?? c.defaultPer ?? 25) !== (c.defaultPer ?? 25) || c.dir !== (c.defaultDir ?? "desc");
  return (
    <>
      <form className="mb-3 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4" role="search">
        {Object.entries(c.keep ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <div className="flex flex-wrap items-center gap-2">
          {main.map(control)}
          {sorts && sorts.length > 0 && <>
            <select name={sk} defaultValue={c.sort} aria-label="Sort by" className={sel}>{sorts.map((o) => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}</select>
            <select name={dk} defaultValue={c.dir} aria-label="Sort direction" className={sel}><option value="desc">↓ Descending</option><option value="asc">↑ Ascending</option></select>
          </>}
          {sizes && <select name={pk} defaultValue={String(c.per ?? c.defaultPer ?? 25)} aria-label="Rows per page" className={sel}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}</select>}
        </div>
        {more.length > 0 && (
          <details open={more.some((f) => c.values[f.name])}>
            <summary className="cursor-pointer text-sm font-medium text-brand">More filters</summary>
            <div className="mt-3 flex flex-wrap items-end gap-3">{more.map(control)}</div>
          </details>
        )}
        <div className="flex flex-wrap items-center gap-2"><button className={btnPrimary}>Apply</button>{changed && <Link href={listHref(c.base, c.keep ?? {})} className={btnGhost}>Reset</Link>}</div>
      </form>
      {active.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Active filters">
          {active.map((f) => <Link key={f.name} href={hrefFor(c, { [f.name]: undefined, page: undefined })} className="rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand hover:bg-brand/20">{chipText(f)} ✕</Link>)}
        </div>
      )}
    </>
  );
}
