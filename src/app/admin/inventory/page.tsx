import { guard } from "@/lib/admin/guard";
import { Card, PageHeader, Pager, Pill, Table, btnGhost, dubaiDate, inputCls } from "@/components/admin/ui";
import { listInventory, recentMovements } from "@/features/admin/catalog/queries";
import { StockForm } from "@/features/admin/catalog/stock-form";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: PageProps<"/admin/inventory">) {
  await guard("inventory:write", "/admin/inventory");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const page = Math.max(1, Number(s("page")) || 1);
  const [{ rows, total, pages }, moves] = await Promise.all([listInventory({ q: s("q"), low: s("low") === "1", page }), recentMovements()]);
  const href = (p: number) => `/admin/inventory?${new URLSearchParams({ ...(s("q") && { q: s("q") }), ...(s("low") && { low: "1" }), page: String(p) })}`;
  return (
    <>
      <PageHeader title="Inventory" sub={`${total} product${total === 1 ? "" : "s"} · changes are logged with reason, quantity, actor and time`} />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={s("q")} placeholder="Search name or SKU…" aria-label="Search" className={`${inputCls} max-w-xs`} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="low" value="1" defaultChecked={s("low") === "1"} className="size-4 accent-[var(--brand)]" />Low / out of stock only</label>
        <button className={btnGhost}>Filter</button>
      </form>
      <Table head={["Product / SKU", "Stock", "Adjust"]} empty={rows.length ? undefined : "Nothing matches."}>
        {rows.flatMap((p) => (p.variants.length ? p.variants.map((v) => ({ key: v.sku, name: `${p.name} — ${v.label}`, sku: v.sku, stock: v.stock, low: p.low, id: p.id })) : [{ key: p.sku, name: p.name, sku: p.sku, stock: p.stock, low: p.low, id: p.id }])).map((r) => (
          <tr key={r.key}><td><span className="block font-medium">{r.name}</span><span className="text-xs text-muted">{r.sku}</span></td><td><Pill tone={r.stock === 0 ? "red" : r.stock <= r.low ? "gold" : "green"}>{r.stock}</Pill></td><td><StockForm productId={r.id} sku={r.sku} /></td></tr>
        ))}
      </Table>
      <Pager page={page} pages={pages} href={href} />
      <Card title="Recent stock movements" className="mt-8">
        {moves.length === 0 ? <p className="text-sm text-muted">No movements yet.</p> : <ul className="flex flex-col gap-2 text-sm">{moves.map((m) => <li key={m.id} className="flex flex-wrap justify-between gap-2"><span><b className={m.delta < 0 ? "text-danger" : "text-brand"}>{m.delta > 0 ? "+" : ""}{m.delta}</b> {m.sku} <span className="text-muted">· {m.reason.replace(/_/g, " ")}{m.note ? ` · ${m.note}` : ""}</span></span><span className="text-xs text-muted">{dubaiDate(m.at, true)}</span></li>)}</ul>}
      </Card>
    </>
  );
}
