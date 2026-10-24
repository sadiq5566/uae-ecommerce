import Link from "next/link";
import { guard } from "@/lib/admin/guard";
import { connectDb } from "@/lib/db";
import { PageHeader, Pager, Pill, btnGhost, dubaiDate } from "@/components/admin/ui";
import { FilterForm, hrefFor, type FilterField } from "@/components/admin/list-ui";
import { day, dayRange, oneOf, parsePage, parseSize, parseSort, rx, str } from "@/lib/admin/list";
import { moderateReviewAction } from "@/features/admin/reviews/actions";
import { Product } from "@/models/product";
import { Review } from "@/models/review";

export const metadata = { title: "Reviews" };
const TABS = [["pending", "Pending"], ["flagged", "Flagged"], ["approved", "Approved"], ["rejected", "Rejected"], ["hidden", "Hidden"]] as const;

export default async function ReviewsAdmin({ searchParams }: PageProps<"/admin/reviews">) {
  await guard("reviews:moderate", "/admin/reviews");
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as string) : "pending";
  const v = { q: str(sp, "q"), rating: oneOf(str(sp, "rating"), ["1", "2", "3", "4", "5"]), verified: oneOf(str(sp, "verified"), ["yes", "no"]), product: str(sp, "product", 60), flagged: oneOf(str(sp, "flagged"), ["yes"]), from: day(sp, "from"), to: day(sp, "to") };
  const { sort, dir, mongo } = parseSort(sp, ["newest", "rating", "flags", "helpful"] as const, tab === "flagged" ? "flags" : "newest", "desc");
  const per = parseSize(sp, 15); const page = parsePage(sp);
  await connectDb();
  const and: Record<string, unknown>[] = [tab === "flagged" ? { flagCount: { $gt: 0 } } : { status: tab }];
  if (v.q) { const re = rx(v.q); and.push({ $or: [{ authorName: re }, { title: re }, { body: re }] }); }
  if (v.rating) and.push({ rating: Number(v.rating) });
  if (v.verified) and.push({ verified: v.verified === "yes" });
  if (v.flagged) and.push({ flagCount: { $gt: 0 } });
  if (v.product) { const re = rx(v.product); and.push({ product: { $in: (await Product.find({ $or: [{ "name.en": re }, { sku: re }, { slug: re }] }, { _id: 1 }).limit(200).lean()).map((p) => p._id) } }); }
  const range = dayRange(v.from, v.to); if (range) and.push({ createdAt: range });
  const f = { $and: and };
  const sortField = { newest: "createdAt", rating: "rating", flags: "flagCount", helpful: "helpfulCount" }[sort];
  const [rows, total, counts] = await Promise.all([
    Review.find(f).sort({ [sortField]: mongo, createdAt: -1 }).skip((page - 1) * per).limit(per).lean(),
    Review.countDocuments(f),
    Promise.all([Review.countDocuments({ status: "pending" }), Review.countDocuments({ flagCount: { $gt: 0 } })]),
  ]);
  const c = { base: "/admin/reviews", values: v as Record<string, string>, sort, dir, per, defaultSort: tab === "flagged" ? "flags" : "newest", defaultDir: "desc" as const, defaultPer: 15, keep: (tab === "pending" ? {} : { tab }) as Record<string, string> };
  const fields: FilterField[] = [
    { name: "q", label: "Search", kind: "search", placeholder: "Author, title or text…" },
    { name: "rating", label: "Rating", kind: "select", options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${"★".repeat(n)} (${n})` })) },
    { name: "verified", label: "Purchase", kind: "select", options: [{ value: "yes", label: "Verified purchase" }, { value: "no", label: "Not verified" }] },
    { name: "product", label: "Product", kind: "search", placeholder: "Product name, SKU or slug", more: true },
    { name: "flagged", label: "Reports", kind: "select", options: [{ value: "yes", label: "Reported by customers" }], more: true },
    { name: "from", label: "Written from", kind: "date", more: true }, { name: "to", label: "Written to", kind: "date", more: true },
  ];
  const products = new Map((await Product.find({ _id: { $in: rows.map((r) => r.product) } }, { name: 1, slug: 1 }).lean()).map((p) => [String(p._id), p]));
  const act = (id: string, to: string, label: string, tone = "") => <form action={moderateReviewAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="to" value={to} /><button className={`${btnGhost} ${tone}`}>{label}</button></form>;
  return (
    <>
      <PageHeader title="Review moderation" sub="Reviews are visible in the store only after approval. Customers can report reviews; 3 reports return an approved review to the queue." />
      <nav className="mb-5 flex flex-wrap gap-1 rounded-full border border-line bg-surface p-1" aria-label="Review status">
        {TABS.map(([k, label]) => <Link key={k} href={`/admin/reviews?tab=${k}`} aria-current={tab === k} className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === k ? "bg-brand text-brand-fg" : "hover:bg-surface-2"}`}>{label}{k === "pending" && counts[0] ? ` (${counts[0]})` : k === "flagged" && counts[1] ? ` (${counts[1]})` : ""}</Link>)}
      </nav>
      <FilterForm {...c} fields={fields} sorts={[{ value: "newest", label: "Date written" }, { value: "rating", label: "Rating" }, { value: "flags", label: "Reports" }, { value: "helpful", label: "Helpful votes" }]} />
      {rows.length === 0 ? <p className="rounded-2xl border border-dashed border-line py-16 text-center text-sm text-muted">Nothing here. 🎉</p> : (
        <ul className="flex flex-col gap-4">
          {rows.map((r) => { const p = products.get(String(r.product)); const id = String(r._id); return (
            <li key={id} className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm"><span className="text-gold" aria-label={`${r.rating} stars`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span> <b>{r.authorName}</b> {r.verified && <Pill tone="green">verified purchase</Pill>} {r.demo && <Pill tone="gold">demo</Pill>} {r.flagCount > 0 && <Pill tone="red">{r.flagCount} report{r.flagCount > 1 ? "s" : ""}</Pill>}</p>
                <p className="text-xs text-muted">{p?.name ?? "(deleted product)"} · {dubaiDate((r as unknown as { createdAt: Date }).createdAt, true)}</p>
              </div>
              {r.title && <p className="mt-2 font-semibold">{r.title}</p>}
              <p className="mt-1 whitespace-pre-line text-sm text-muted">{r.body}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {r.status !== "approved" && act(id, "approved", "Approve", "!border-brand !text-brand")}
                {r.status !== "rejected" && act(id, "rejected", "Reject")}
                {r.status !== "hidden" && act(id, "hidden", "Hide")}
                {p && <Link href={`/en/p/${p.slug}`} className={btnGhost}>View product ↗</Link>}
              </div>
            </li>
          ); })}
        </ul>
      )}
      <Pager page={page} pages={Math.max(1, Math.ceil(total / per))} href={(p) => hrefFor(c, { page: p })} />
    </>
  );
}
