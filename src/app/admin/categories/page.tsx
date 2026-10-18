import Link from "next/link";
import { guard } from "@/lib/admin/guard";
import { LinkButton, PageHeader, Pill, Table } from "@/components/admin/ui";
import { FilterForm, SortHead, type FilterField } from "@/components/admin/list-ui";
import { oneOf, parseSort, str } from "@/lib/admin/list";
import { listCategoriesAdmin } from "@/features/admin/catalog/queries";

export const metadata = { title: "Categories" };

export default async function CategoriesPage({ searchParams }: PageProps<"/admin/categories">) {
  await guard("categories:write", "/admin/categories");
  const [all, sp] = await Promise.all([listCategoriesAdmin(), searchParams]);
  const v = { q: str(sp, "q"), status: oneOf(str(sp, "status"), ["active", "hidden"]), level: oneOf(str(sp, "level"), ["top", "sub"]), products: oneOf(str(sp, "products"), ["with", "without"]) };
  const { sort, dir } = parseSort(sp, ["order", "name", "slug", "products", "status"] as const, "order", "asc");
  const q = v.q.toLowerCase();
  let rows = all.filter((c) => (!q || c.name.toLowerCase().includes(q) || c.nameAr.includes(v.q) || c.slug.includes(q))
    && (!v.status || (v.status === "active") === c.active) && (!v.level || (v.level === "sub") === (c.depth > 0)) && (!v.products || (v.products === "with") === (c.products > 0)));
  // Default order keeps sub-categories under their parent; any other sort shows a flat, sorted list.
  if (sort !== "order") {
    const key = (c: (typeof all)[number]): string | number => sort === "name" ? c.name.toLowerCase() : sort === "slug" ? c.slug : sort === "products" ? c.products : c.active ? 1 : 0;
    rows = [...rows].sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * (dir === "asc" ? 1 : -1); });
  } else if (dir === "desc") rows = [...rows].reverse();
  const c = { base: "/admin/categories", values: v as Record<string, string>, sort, dir, defaultSort: "order", defaultDir: "asc" as const };
  const fields: FilterField[] = [
    { name: "q", label: "Search", kind: "search", placeholder: "Name or slug…" },
    { name: "status", label: "Status", kind: "select", options: [{ value: "active", label: "Active" }, { value: "hidden", label: "Hidden" }] },
    { name: "level", label: "Level", kind: "select", options: [{ value: "top", label: "Top-level" }, { value: "sub", label: "Sub-categories" }] },
    { name: "products", label: "Products", kind: "select", options: [{ value: "with", label: "Has products" }, { value: "without", label: "Empty" }] },
  ];
  const H = (l: string, field: string) => <SortHead label={l} field={field} {...c} />;
  return (
    <>
      <PageHeader title="Categories" sub="Nested categories and the filter attributes products can set." actions={<><LinkButton href="/admin/import" variant="ghost">Import / export</LinkButton><LinkButton href="/admin/categories/new">+ New category</LinkButton></>} />
      {sp.saved && <p role="status" className="mb-4 rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">✓ Category created.</p>}
      <FilterForm {...c} sizes={false} fields={fields} sorts={[{ value: "order", label: "Menu order (grouped)" }, { value: "name", label: "Name" }, { value: "slug", label: "Slug" }, { value: "products", label: "Product count" }, { value: "status", label: "Status" }]} />
      <Table head={[H("Category", "name"), H("Slug", "slug"), H("Products", "products"), H("Order", "order"), H("Status", "status")]} empty={rows.length ? undefined : "No categories match."}>
        {rows.map((c) => (
          <tr key={c.id}>
            <td><Link href={`/admin/categories/${c.id}`} className={`flex items-center gap-2 font-medium hover:text-brand ${c.depth ? "ps-6" : ""}`}><span>{c.icon}</span>{c.name} <span className="text-xs text-muted" dir="rtl">{c.nameAr}</span></Link></td>
            <td className="text-muted">{c.slug}</td><td>{c.products}</td><td>{c.order}</td><td><Pill tone={c.active ? "green" : "grey"}>{c.active ? "active" : "hidden"}</Pill></td>
          </tr>
        ))}
      </Table>
    </>
  );
}
