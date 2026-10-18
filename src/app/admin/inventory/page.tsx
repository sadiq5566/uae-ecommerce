import { guard } from "@/lib/admin/guard";
import { Card, PageHeader, Pager, Pill, Table, dubaiDate } from "@/components/admin/ui";
import { FilterForm, SortHead, hrefFor, type FilterField } from "@/components/admin/list-ui";
import { Thumb } from "@/components/thumb";
import { INVENTORY_SORTS, categoryOptions, listInventory, recentMovements, type InventoryFilters } from "@/features/admin/catalog/queries";
import { StockForm } from "@/features/admin/catalog/stock-form";
import { day, oneOf, parsePage, parseSize, parseSort, str } from "@/lib/admin/list";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: PageProps<"/admin/inventory">) {
  await guard("inventory:write", "/admin/inventory");
  const sp = await searchParams;
  const f: InventoryFilters = {
    q: str(sp, "q"), level: oneOf(str(sp, "level") || (str(sp, "low") === "1" ? "lowout" : ""), ["out", "low", "lowout", "ok"]), status: oneOf(str(sp, "status"), ["draft", "published"]),
    category: str(sp, "category", 30), variants: oneOf(str(sp, "variants"), ["with", "without"]), from: day(sp, "from"), to: day(sp, "to"),
  };
  const { sort, dir, mongo } = parseSort(sp, Object.keys(INVENTORY_SORTS) as (keyof typeof INVENTORY_SORTS)[], "stock", "asc");
  const per = parseSize(sp, 25); const page = parsePage(sp);
  const [{ rows, total, pages }, moves, cats] = await Promise.all([listInventory(f, sort, mongo, page, per), recentMovements(), categoryOptions()]);
  const c = { base: "/admin/inventory", values: f as unknown as Record<string, string>, sort, dir, per, defaultSort: "stock", defaultDir: "asc" as const, defaultPer: 25 };
  const fields: FilterField[] = [
    { name: "q", label: "Search", kind: "search", placeholder: "Name, SKU, option SKU or brand…" },
    { name: "level", label: "Stock level", kind: "select", options: [{ value: "out", label: "Out of stock" }, { value: "low", label: "Low (above 0)" }, { value: "lowout", label: "Low or out" }, { value: "ok", label: "Healthy" }] },
    { name: "category", label: "Category", kind: "select", options: cats.map((x) => ({ value: x.id, label: `${x.parent ? "— " : ""}${x.name}` })) },
    { name: "status", label: "Status", kind: "select", options: [{ value: "published", label: "Published" }, { value: "draft", label: "Draft" }], more: true },
    { name: "variants", label: "Options", kind: "select", options: [{ value: "with", label: "Has colour/size options" }, { value: "without", label: "No options" }], more: true },
    { name: "from", label: "Updated from", kind: "date", more: true }, { name: "to", label: "Updated to", kind: "date", more: true },
  ];
  const H = (l: string, field: string) => <SortHead label={l} field={field} {...c} />;
  return (
    <>
      <PageHeader title="Inventory" sub={`${total} product${total === 1 ? "" : "s"} · changes are logged with reason, quantity, actor and time`} />
      <FilterForm {...c} fields={fields} sorts={[{ value: "stock", label: "Stock" }, { value: "name", label: "Name" }, { value: "sku", label: "SKU" }, { value: "threshold", label: "Low-stock threshold" }, { value: "updated", label: "Last updated" }, { value: "status", label: "Status" }]} />
      <Table head={[<>{H("Product", "name")} / {H("SKU", "sku")}</>, H("Stock", "stock"), "Adjust"]} empty={rows.length ? undefined : "Nothing matches."}>
        {rows.flatMap((p) => (p.variants.length ? p.variants.map((v) => ({ key: v.sku, name: `${p.name} — ${v.label}`, sku: v.sku, stock: v.stock, low: p.low, id: p.id, image: p.image })) : [{ key: p.sku, name: p.name, sku: p.sku, stock: p.stock, low: p.low, id: p.id, image: p.image }])).map((r) => (
          <tr key={r.key}><td><span className="flex items-center gap-3"><Thumb src={r.image} size={40} /><span><span className="block font-medium">{r.name}</span><span className="text-xs text-muted">{r.sku}</span></span></span></td><td><Pill tone={r.stock === 0 ? "red" : r.stock <= r.low ? "gold" : "green"}>{r.stock}</Pill></td><td><StockForm productId={r.id} sku={r.sku} /></td></tr>
        ))}
      </Table>
      <Pager page={page} pages={pages} href={(p) => hrefFor(c, { page: p })} />
      <Card title="Recent stock movements" className="mt-8">
        {moves.length === 0 ? <p className="text-sm text-muted">No movements yet.</p> : <ul className="flex flex-col gap-2 text-sm">{moves.map((m) => <li key={m.id} className="flex flex-wrap justify-between gap-2"><span><b className={m.delta < 0 ? "text-danger" : "text-brand"}>{m.delta > 0 ? "+" : ""}{m.delta}</b> {m.sku} <span className="text-muted">· {m.reason.replace(/_/g, " ")}{m.note ? ` · ${m.note}` : ""}</span></span><span className="text-xs text-muted">{dubaiDate(m.at, true)}</span></li>)}</ul>}
      </Card>
    </>
  );
}
