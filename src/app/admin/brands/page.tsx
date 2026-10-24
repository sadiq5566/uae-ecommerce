import Link from "next/link";
import { guard } from "@/lib/admin/guard";
import { LinkButton, PageHeader, Pill, Table } from "@/components/admin/ui";
import { listBrandsAdmin } from "@/features/catalog/brands";

export const metadata = { title: "Brands" };

export default async function BrandsPage({ searchParams }: PageProps<"/admin/brands">) {
  await guard("categories:write", "/admin/brands");
  const [rows, sp] = await Promise.all([listBrandsAdmin(), searchParams]);
  const q = (typeof sp.q === "string" ? sp.q : "").toLowerCase();
  const shown = rows.filter((b) => !q || `${b.name} ${b.slug}`.toLowerCase().includes(q));
  return (
    <>
      <PageHeader title="Brands" sub="Who makes the product (Rolex, Zegna…). Separate from the category (watches, bags, footwear…). A new brand is added automatically when a product has one." actions={<LinkButton href="/admin/brands/new">+ New brand</LinkButton>} />
      {sp.saved && <p role="status" className="mb-4 rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">✓ Brand created.</p>}
      <form className="mb-3" role="search"><input name="q" defaultValue={typeof sp.q === "string" ? sp.q : ""} placeholder="Search brands…" aria-label="Search brands" className="w-full max-w-sm rounded-xl border border-line bg-bg px-3 py-2.5 text-sm" /></form>
      <Table head={["Brand", "Products", "Order", "Status"]} empty={shown.length ? undefined : "No brands yet. They appear here as soon as a product has a brand."}>
        {shown.map((b) => (
          <tr key={b.id}>
            <td><Link href={`/admin/brands/${b.id}`} className="font-medium hover:text-brand">{b.name}</Link> {b.isFeatured && <Pill tone="gold">featured</Pill>}<br /><span className="text-xs text-muted">/brands/{b.slug}</span></td>
            <td><Link href={`/admin/products?brand=${encodeURIComponent(b.name)}`} className="hover:text-brand">{b.products}</Link> <span className="text-muted">({b.live} live)</span></td>
            <td>{b.sortOrder}</td>
            <td><Pill tone={b.isActive ? "green" : "grey"}>{b.isActive ? "shown" : "hidden"}</Pill></td>
          </tr>
        ))}
      </Table>
    </>
  );
}
