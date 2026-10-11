import Link from "next/link";
import { guard } from "@/lib/admin/guard";
import { connectDb } from "@/lib/db";
import { LinkButton, PageHeader, Pill, Table, dubaiDate } from "@/components/admin/ui";
import { Article } from "@/models/article";

export const metadata = { title: "Articles" };

export default async function Articles({ searchParams }: PageProps<"/admin/articles">) {
  await guard("articles:write", "/admin/articles");
  await connectDb();
  const [rows, sp] = await Promise.all([Article.find().sort({ updatedAt: -1 }).limit(200).select("slug title status publishAt author").lean(), searchParams]);
  const now = new Date();
  return (
    <>
      <PageHeader title="Articles" sub="Journal posts. Published articles with a future date go live automatically." actions={<LinkButton href="/admin/articles/new">+ New article</LinkButton>} />
      {sp.saved && <p role="status" className="mb-4 rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">✓ Article created.</p>}
      <Table head={["Title", "Author", "Publish", "Status"]} empty={rows.length ? undefined : "No articles yet."}>
        {rows.map((a) => { const scheduled = a.status === "published" && a.publishAt && a.publishAt > now; return (
          <tr key={String(a._id)}><td><Link href={`/admin/articles/${a._id}`} className="font-medium hover:text-brand">{a.title?.en}</Link><span className="block text-xs text-muted">/{a.slug}</span></td><td className="text-muted">{a.author ?? "—"}</td><td className="text-xs text-muted">{a.publishAt ? dubaiDate(a.publishAt, true) : "—"}</td><td><Pill tone={scheduled ? "gold" : a.status === "published" ? "green" : "grey"}>{scheduled ? "scheduled" : a.status}</Pill></td></tr>
        ); })}
      </Table>
    </>
  );
}
