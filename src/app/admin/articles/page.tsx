import Link from "next/link";
import { guard } from "@/lib/admin/guard";
import { connectDb } from "@/lib/db";
import { LinkButton, PageHeader, Pager, Pill, Table, dubaiDate } from "@/components/admin/ui";
import { FilterForm, SortHead, hrefFor, type FilterField } from "@/components/admin/list-ui";
import { day, dayRange, oneOf, parsePage, parseSize, parseSort, rx, str } from "@/lib/admin/list";
import { Article } from "@/models/article";

export const metadata = { title: "Articles" };
const SORTS = { updated: "updatedAt", title: "title.en", author: "author", publish: "publishAt", status: "status" } as const;

export default async function Articles({ searchParams }: PageProps<"/admin/articles">) {
  await guard("articles:write", "/admin/articles");
  const sp = await searchParams;
  const v = { q: str(sp, "q"), status: oneOf(str(sp, "status"), ["draft", "published", "scheduled"]), author: str(sp, "author", 60), from: day(sp, "from"), to: day(sp, "to") };
  const { sort, dir, mongo } = parseSort(sp, Object.keys(SORTS) as (keyof typeof SORTS)[], "updated", "desc");
  const per = parseSize(sp, 25); const page = parsePage(sp);
  await connectDb();
  const now = new Date();
  const and: Record<string, unknown>[] = [];
  if (v.q) { const re = rx(v.q); and.push({ $or: [{ "title.en": re }, { "title.ar": re }, { slug: re }, { author: re }, { category: re }] }); }
  if (v.status === "draft") and.push({ status: "draft" });
  if (v.status === "published") and.push({ status: "published", $or: [{ publishAt: null }, { publishAt: { $lte: now } }] });
  if (v.status === "scheduled") and.push({ status: "published", publishAt: { $gt: now } });
  if (v.author) and.push({ author: rx(v.author) });
  const range = dayRange(v.from, v.to); if (range) and.push({ publishAt: range });
  const f = and.length ? { $and: and } : {};
  const [rows, total] = await Promise.all([Article.find(f).sort({ [SORTS[sort]]: mongo, _id: 1 }).skip((page - 1) * per).limit(per).select("slug title status publishAt author").lean(), Article.countDocuments(f)]);
  const c = { base: "/admin/articles", values: v as Record<string, string>, sort, dir, per, defaultSort: "updated", defaultDir: "desc" as const, defaultPer: 25 };
  const fields: FilterField[] = [
    { name: "q", label: "Search", kind: "search", placeholder: "Title, slug, author, category…" },
    { name: "status", label: "Status", kind: "select", options: [{ value: "draft", label: "Draft" }, { value: "published", label: "Published" }, { value: "scheduled", label: "Scheduled" }] },
    { name: "author", label: "Author", kind: "search", more: true },
    { name: "from", label: "Publish from", kind: "date", more: true }, { name: "to", label: "Publish to", kind: "date", more: true },
  ];
  const H = (l: string, field: string) => <SortHead label={l} field={field} {...c} />;
  return (
    <>
      <PageHeader title="Articles" sub={`${total} article${total === 1 ? "" : "s"} · published articles with a future date go live automatically.`} actions={<LinkButton href="/admin/articles/new">+ New article</LinkButton>} />
      {sp.saved && <p role="status" className="mb-4 rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">✓ Article created.</p>}
      <FilterForm {...c} fields={fields} sorts={[{ value: "updated", label: "Last updated" }, { value: "publish", label: "Publish date" }, { value: "title", label: "Title" }, { value: "author", label: "Author" }, { value: "status", label: "Status" }]} />
      <Table head={[H("Title", "title"), H("Author", "author"), H("Publish", "publish"), H("Status", "status")]} empty={rows.length ? undefined : "No articles match."}>
        {rows.map((a) => { const scheduled = a.status === "published" && a.publishAt && a.publishAt > now; return (
          <tr key={String(a._id)}><td><Link href={`/admin/articles/${a._id}`} className="font-medium hover:text-brand">{a.title?.en || a.title?.ar}</Link><span className="block text-xs text-muted">/{a.slug}</span></td><td className="text-muted">{a.author ?? "—"}</td><td className="text-xs text-muted">{a.publishAt ? dubaiDate(a.publishAt, true) : "—"}</td><td><Pill tone={scheduled ? "gold" : a.status === "published" ? "green" : "grey"}>{scheduled ? "scheduled" : a.status}</Pill></td></tr>
        ); })}
      </Table>
      <Pager page={page} pages={Math.max(1, Math.ceil(total / per))} href={(p) => hrefFor(c, { page: p })} />
    </>
  );
}
