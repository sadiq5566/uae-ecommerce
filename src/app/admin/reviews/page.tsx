import Link from "next/link";
import { guard } from "@/lib/admin/guard";
import { connectDb } from "@/lib/db";
import { PageHeader, Pager, Pill, btnGhost, dubaiDate } from "@/components/admin/ui";
import { moderateReviewAction } from "@/features/admin/reviews/actions";
import { Product } from "@/models/product";
import { Review } from "@/models/review";

export const metadata = { title: "Reviews" };
const TABS = [["pending", "Pending"], ["flagged", "Flagged"], ["approved", "Approved"], ["rejected", "Rejected"], ["hidden", "Hidden"]] as const;

export default async function ReviewsAdmin({ searchParams }: PageProps<"/admin/reviews">) {
  await guard("reviews:moderate", "/admin/reviews");
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as string) : "pending";
  const page = Math.max(1, Number(sp.page) || 1);
  await connectDb();
  const f: Record<string, unknown> = tab === "flagged" ? { flagCount: { $gt: 0 } } : { status: tab };
  const [rows, total, counts] = await Promise.all([
    Review.find(f).sort(tab === "flagged" ? { flagCount: -1, createdAt: -1 } : { createdAt: -1 }).skip((page - 1) * 15).limit(15).lean(),
    Review.countDocuments(f),
    Promise.all([Review.countDocuments({ status: "pending" }), Review.countDocuments({ flagCount: { $gt: 0 } })]),
  ]);
  const products = new Map((await Product.find({ _id: { $in: rows.map((r) => r.product) } }, { name: 1, slug: 1 }).lean()).map((p) => [String(p._id), p]));
  const act = (id: string, to: string, label: string, tone = "") => <form action={moderateReviewAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="to" value={to} /><button className={`${btnGhost} ${tone}`}>{label}</button></form>;
  return (
    <>
      <PageHeader title="Review moderation" sub="Reviews are visible in the store only after approval. Customers can report reviews; 3 reports return an approved review to the queue." />
      <nav className="mb-5 flex flex-wrap gap-1 rounded-full border border-line bg-surface p-1" aria-label="Review status">
        {TABS.map(([k, label]) => <Link key={k} href={`/admin/reviews?tab=${k}`} aria-current={tab === k} className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === k ? "bg-brand text-brand-fg" : "hover:bg-surface-2"}`}>{label}{k === "pending" && counts[0] ? ` (${counts[0]})` : k === "flagged" && counts[1] ? ` (${counts[1]})` : ""}</Link>)}
      </nav>
      {rows.length === 0 ? <p className="rounded-2xl border border-dashed border-line py-16 text-center text-sm text-muted">Nothing here. 🎉</p> : (
        <ul className="flex flex-col gap-4">
          {rows.map((r) => { const p = products.get(String(r.product)); const id = String(r._id); return (
            <li key={id} className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm"><span className="text-gold" aria-label={`${r.rating} stars`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span> <b>{r.authorName}</b> {r.verified && <Pill tone="green">verified purchase</Pill>} {r.demo && <Pill tone="gold">demo</Pill>} {r.flagCount > 0 && <Pill tone="red">{r.flagCount} report{r.flagCount > 1 ? "s" : ""}</Pill>}</p>
                <p className="text-xs text-muted">{p?.name?.en ?? "(deleted product)"} · {dubaiDate((r as unknown as { createdAt: Date }).createdAt, true)}</p>
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
      <Pager page={page} pages={Math.max(1, Math.ceil(total / 15))} href={(p) => `/admin/reviews?tab=${tab}&page=${p}`} />
    </>
  );
}
