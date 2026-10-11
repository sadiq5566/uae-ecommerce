import Link from "next/link";
import { guard } from "@/lib/admin/guard";
import { LinkButton, PageHeader, Pill, Table } from "@/components/admin/ui";
import { listCategoriesAdmin } from "@/features/admin/catalog/queries";

export const metadata = { title: "Categories" };

export default async function CategoriesPage({ searchParams }: PageProps<"/admin/categories">) {
  await guard("categories:write", "/admin/categories");
  const [rows, sp] = await Promise.all([listCategoriesAdmin(), searchParams]);
  return (
    <>
      <PageHeader title="Categories" sub="Nested categories and the filter attributes products can set." actions={<><LinkButton href="/admin/import" variant="ghost">Import / export</LinkButton><LinkButton href="/admin/categories/new">+ New category</LinkButton></>} />
      {sp.saved && <p role="status" className="mb-4 rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">✓ Category created.</p>}
      <Table head={["Category", "Slug", "Products", "Order", "Status"]} empty={rows.length ? undefined : "No categories yet."}>
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
