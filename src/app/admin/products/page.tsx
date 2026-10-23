import Image from "next/image";
import Link from "next/link";
import { guard } from "@/lib/admin/guard";
import { LinkButton, PageHeader, Pager, Pill, Table, aed, btnGhost, btnPrimary, inputCls } from "@/components/admin/ui";
import { BulkForm, RowCheck } from "@/features/admin/catalog/bulk-select";
import { FILTER_KEYS, PAGE_SIZES, PRODUCT_SORTS, brandOptions, categoryOptions, listProductsAdmin, parseProductFilters } from "@/features/admin/catalog/queries";

export const metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await guard("products:write", "/admin/products");
  const sp = await searchParams;
  const f = parseProductFilters(sp);
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const [{ rows, total, pages }, cats, brands] = await Promise.all([listProductsAdmin(f, page), categoryOptions(), brandOptions()]);

  // Non-default filters, kept in every link (pager, chips) and sent to the bulk action ("select all N matching").
  const active = new URLSearchParams();
  for (const k of FILTER_KEYS) { const v = String(f[k]); if (v && !(k === "sort" && v === "updated") && !(k === "per" && v === "20")) active.set(k, v); }
  const filterQs = active.toString();
  const to = (u: URLSearchParams) => { const q = u.toString(); return `/admin/products${q ? `?${q}` : ""}`; };
  const href = (p: number) => { const u = new URLSearchParams(active); if (p > 1) u.set("page", String(p)); return to(u); };
  const without = (...keys: string[]) => { const u = new URLSearchParams(active); keys.forEach((k) => u.delete(k)); return to(u); };
  const filterCount = [...active.keys()].filter((k) => k !== "sort" && k !== "per").length;
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const sel = `${inputCls} !w-auto`;
  // Column headers: click to sort ascending, click again for descending (maps onto the same `sort` values as the dropdown).
  const head = (label: string, field: "name" | "price" | "stock" | "status") => {
    const on = f.sort.startsWith(`${field}_`);
    const nextSort = on && f.sort.endsWith("_asc") ? `${field}_desc` : `${field}_asc`;
    const u = new URLSearchParams(active); u.set("sort", nextSort); u.delete("page");
    return <Link href={to(u)} scroll={false} aria-label={`Sort by ${label}`} className={`inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-wide hover:text-brand ${on ? "text-brand" : ""}`}>{label}<span aria-hidden className={on ? "" : "opacity-30"}>{on ? (f.sort.endsWith("_asc") ? "▲" : "▼") : "↕"}</span></Link>;
  };
  const chip = (label: string, ...keys: string[]) => <Link key={keys[0]} href={without(...keys)} className="rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand hover:bg-brand/20">{label} ✕</Link>;
  const chips = [
    f.q && chip(`“${f.q}”`, "q"), f.status && chip(`Status: ${f.status}`, "status"), f.category && chip(`Category: ${catName.get(f.category) ?? "…"}`, "category"),
    f.brand && chip(`Brand: ${f.brand}`, "brand"), f.tag && chip(`Tag: ${f.tag}`, "tag"),
    f.stock && chip(`Stock: ${{ in: "in stock", out: "out of stock", low: "low stock" }[f.stock]}`, "stock"), f.featured && chip(f.featured === "1" ? "Featured" : "Not featured", "featured"),
    f.sale && chip("On sale", "sale"), f.image && chip(f.image === "with" ? "Has image" : "No image", "image"), f.variants && chip(f.variants === "with" ? "Has options" : "No options", "variants"),
    (f.min || f.max) && chip(`Price ${f.min || "0"}–${f.max || "∞"}`, "min", "max"), (f.from || f.to) && chip(`Created ${f.from || "…"} → ${f.to || "…"}`, "from", "to"),
  ].filter(Boolean);

  return (
    <>
      <PageHeader title="Products" sub={`${total} product${total === 1 ? "" : "s"}${filterCount ? " match your filters" : ""}`} actions={<><LinkButton href="/admin/import" variant="ghost">Import / export</LinkButton><LinkButton href="/admin/products/new">+ New product</LinkButton></>} />
      {typeof sp.saved === "string" && <p role="status" className="mb-4 rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">✓ Product created.</p>}
      <form className="mb-3 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4" role="search">
        <div className="flex flex-wrap items-center gap-2">
          <input name="q" defaultValue={f.q} placeholder="Search name, SKU, slug, brand, tag…" aria-label="Search" className={`${inputCls} max-w-sm`} />
          <select name="status" defaultValue={f.status} aria-label="Status" className={sel}><option value="">All statuses</option><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select>
          <select name="category" defaultValue={f.category} aria-label="Category" className={sel}><option value="">All categories</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.parent ? "— " : ""}{c.name}</option>)}</select>
          <select name="stock" defaultValue={f.stock} aria-label="Stock" className={sel}><option value="">Any stock</option><option value="in">In stock</option><option value="low">Low stock (≤ threshold)</option><option value="out">Out of stock</option></select>
          <select name="sort" defaultValue={f.sort} aria-label="Sort by" className={sel}>{Object.entries(PRODUCT_SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <select name="per" defaultValue={String(f.per)} aria-label="Products per page" className={sel}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}</select>
        </div>
        <details open={!!(f.brand || f.tag || f.featured || f.sale || f.image || f.variants || f.min || f.max || f.from || f.to)}>
          <summary className="cursor-pointer text-sm font-medium text-brand">More filters</summary>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium text-muted">Brand<select name="brand" defaultValue={f.brand} className={`${sel} mt-1 block`}><option value="">Any brand</option>{brands.map((b) => <option key={b} value={b}>{b}</option>)}</select></label>
            <label className="text-xs font-medium text-muted">Tag<input name="tag" defaultValue={f.tag} placeholder="e.g. gift" className={`${inputCls} mt-1 block !w-32`} /></label>
            <label className="text-xs font-medium text-muted">Featured<select name="featured" defaultValue={f.featured} className={`${sel} mt-1 block`}><option value="">Any</option><option value="1">Featured</option><option value="0">Not featured</option></select></label>
            <label className="text-xs font-medium text-muted">Sale<select name="sale" defaultValue={f.sale} className={`${sel} mt-1 block`}><option value="">Any</option><option value="1">On sale</option></select></label>
            <label className="text-xs font-medium text-muted">Images<select name="image" defaultValue={f.image} className={`${sel} mt-1 block`}><option value="">Any</option><option value="with">Has image</option><option value="without">No image</option></select></label>
            <label className="text-xs font-medium text-muted">Colour/size options<select name="variants" defaultValue={f.variants} className={`${sel} mt-1 block`}><option value="">Any</option><option value="with">Has options</option><option value="without">No options</option></select></label>
            <label className="text-xs font-medium text-muted">Price (AED)<span className="mt-1 flex items-center gap-1"><input name="min" type="number" min={0} step="0.01" defaultValue={f.min} placeholder="min" aria-label="Minimum price" className={`${inputCls} !w-24`} />–<input name="max" type="number" min={0} step="0.01" defaultValue={f.max} placeholder="max" aria-label="Maximum price" className={`${inputCls} !w-24`} /></span></label>
            <label className="text-xs font-medium text-muted">Created<span className="mt-1 flex items-center gap-1"><input name="from" type="date" defaultValue={f.from} aria-label="Created from" className={`${inputCls} !w-auto`} />→<input name="to" type="date" defaultValue={f.to} aria-label="Created to" className={`${inputCls} !w-auto`} /></span></label>
          </div>
        </details>
        <div className="flex flex-wrap items-center gap-2"><button className={btnPrimary}>Apply filters</button>{(filterCount > 0 || f.sort !== "updated" || f.per !== 20) && <Link href="/admin/products" className={btnGhost}>Reset</Link>}</div>
      </form>
      {chips.length > 0 && <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Active filters">{chips}</div>}

      <BulkForm total={total} pageIds={rows.map((r) => r.id)} filterQs={filterQs}>
        <Table head={["", head("Product", "name"), "Category", head("Price", "price"), head("Stock", "stock"), head("Status", "status")]} empty={rows.length ? undefined : "No products match."}>
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="w-8"><RowCheck id={p.id} label={p.name} /></td>
              <td><Link href={`/admin/products/${p.id}`} className="flex items-center gap-3 hover:text-brand"><span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-2 text-xl">{p.image ? <Image src={p.image} alt="" fill sizes="40px" className="object-cover" /> : p.icon}</span><span><span className="block font-medium">{p.name}</span><span className="text-xs text-muted">{p.sku}{p.variantCount > 0 && ` · ${p.variantCount} options`}</span></span></Link></td>
              <td className="text-muted">{catName.get(p.category) ?? "—"}</td>
              <td>{p.finalPrice < p.price ? <><b>{aed(p.finalPrice)}</b> <s className="text-xs text-muted">{aed(p.price)}</s></> : aed(p.price)}</td>
              <td><Pill tone={p.stock === 0 ? "red" : p.stock <= p.low ? "gold" : "green"}>{p.stock}</Pill></td>
              <td><Pill tone={p.status === "active" ? "green" : p.status === "draft" ? "gold" : "grey"}>{p.status}</Pill>{p.featured && <> <Pill tone="dark">featured</Pill></>}</td>
            </tr>
          ))}
        </Table>
      </BulkForm>
      <Pager page={page} pages={pages} href={href} />
    </>
  );
}
