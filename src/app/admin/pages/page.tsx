import Link from "next/link";
import { guard } from "@/lib/admin/guard";
import { connectDb } from "@/lib/db";
import { PageHeader, Pill, Table, dubaiDate } from "@/components/admin/ui";
import { ContentPage, PAGE_SLUGS } from "@/models/content-page";

export const metadata = { title: "Pages" };

export default async function PagesAdmin() {
  await guard("articles:write", "/admin/pages");
  await connectDb();
  const rows = await ContentPage.find().lean();
  const by = new Map(rows.map((r) => [r.slug, r]));
  return (
    <>
      <PageHeader title="Pages" sub="About, contact, FAQ, delivery, returns, privacy, terms and help — written by you, in English and Arabic." />
      <Table head={["Page", "Title", "Status", "Updated"]}>
        {PAGE_SLUGS.map((s) => { const p = by.get(s); return <tr key={s}><td><Link href={`/admin/pages/${s}`} className="font-medium capitalize hover:text-brand">{s}</Link></td><td className="text-muted">{p?.title?.en || "—"}</td><td><Pill tone={p?.published ? "green" : "grey"}>{p?.published ? "published" : "hidden"}</Pill></td><td className="text-xs text-muted">{p ? dubaiDate((p as unknown as { updatedAt: Date }).updatedAt) : "—"}</td></tr>; })}
      </Table>
    </>
  );
}
