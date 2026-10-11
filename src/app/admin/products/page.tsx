import Link from "next/link";
import { guard } from "@/lib/admin/guard";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { LinkButton, PageHeader, Pager, Pill, Table, aed, btnGhost, inputCls } from "@/components/admin/ui";
import { bulkProductsAction } from "@/features/admin/catalog/actions";
import { categoryOptions, listProductsAdmin } from "@/features/admin/catalog/queries";

export const metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await guard("products:write", "/admin/products");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const page = Math.max(1, Number(s("page")) || 1);
  const [{ rows, total, pages }, cats] = await Promise.all([listProductsAdmin({ q: s("q"), status: s("status"), category: s("category"), low: s("low") === "1", page }), categoryOptions()]);
  const qs = (p: number) => { const u = new URLSearchParams(); for (const k of ["q", "status", "category", "low"]) if (s(k)) u.set(k, s(k)); u.set("page", String(p)); return `/admin/products?${u}`; };
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  return (
    <>
      <PageHeader title="Products" sub={`${total} product${total === 1 ? "" : "s"}`} actions={<><LinkButton href="/admin/import" variant="ghost">Import / export</LinkButton><LinkButton href="/admin/products/new">+ New product</LinkButton></>} />
      {s("saved") && <p role="status" className="mb-4 rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">✓ Product created.</p>}
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={s("q")} placeholder="Search name, SKU, brand…" aria-label="Search" className={`${inputCls} max-w-xs`} />
        <select name="status" defaultValue={s("status")} aria-label="Status" className={`${inputCls} !w-auto`}><option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select>
        <select name="category" defaultValue={s("category")} aria-label="Category" className={`${inputCls} !w-auto`}><option value="">All categories</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.parent ? "— " : ""}{c.name}</option>)}</select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="low" value="1" defaultChecked={s("low") === "1"} className="size-4 accent-[var(--brand)]" />Low stock</label>
        <button className={btnGhost}>Filter</button>
      </form>
      <form action={bulkProductsAction}>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">With selected:</span>
          {(["publish", "unpublish", "archive"] as const).map((op) => <button key={op} name="op" value={op} className={btnGhost}>{op[0].toUpperCase() + op.slice(1)}</button>)}
          <ConfirmButton name="op" value="delete" message="Delete the selected products? Only draft/archived ones are deleted; past orders keep their own copy." className="rounded-xl border border-danger/40 px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger/10">Delete</ConfirmButton>
        </div>
        <Table head={["", "Product", "Category", "Price", "Stock", "Status"]} empty={rows.length ? undefined : "No products match."}>
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="w-8"><input type="checkbox" name="ids" value={p.id} aria-label={`Select ${p.name}`} className="size-4 accent-[var(--brand)]" /></td>
              <td><Link href={`/admin/products/${p.id}`} className="flex items-center gap-3 hover:text-brand"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-xl">{p.icon}</span><span><span className="block font-medium">{p.name}</span><span className="text-xs text-muted">{p.sku}</span></span></Link></td>
              <td className="text-muted">{catName.get(p.category) ?? "—"}</td>
              <td>{p.finalPrice < p.price ? <><b>{aed(p.finalPrice)}</b> <s className="text-xs text-muted">{aed(p.price)}</s></> : aed(p.price)}</td>
              <td><Pill tone={p.stock === 0 ? "red" : p.stock <= p.low ? "gold" : "green"}>{p.stock}</Pill></td>
              <td><Pill tone={p.status === "published" ? "green" : p.status === "draft" ? "gold" : "grey"}>{p.status}</Pill>{p.featured && <> <Pill tone="dark">featured</Pill></>}</td>
            </tr>
          ))}
        </Table>
      </form>
      <Pager page={page} pages={pages} href={qs} />
    </>
  );
}
