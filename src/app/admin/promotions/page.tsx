import Link from "next/link";
import { guard } from "@/lib/admin/guard";
import { connectDb } from "@/lib/db";
import { LinkButton, PageHeader, Pill, Table, dubaiDate } from "@/components/admin/ui";
import { Coupon } from "@/models/coupon";

export const metadata = { title: "Promotions" };

export default async function Promotions({ searchParams }: PageProps<"/admin/promotions">) {
  await guard("promotions:write", "/admin/promotions");
  await connectDb();
  const [rows, sp] = await Promise.all([Coupon.find().sort({ createdAt: -1 }).limit(200).lean(), searchParams]);
  const now = new Date();
  const state = (c: (typeof rows)[number]) => !c.active ? ["off", "grey"] as const : c.endsAt && c.endsAt < now ? ["expired", "red"] as const : c.startsAt && c.startsAt > now ? ["scheduled", "gold"] as const : c.usageLimit != null && c.usedCount >= c.usageLimit ? ["used up", "red"] as const : ["live", "green"] as const;
  return (
    <>
      <PageHeader title="Promotions" sub="Coupon codes. Item sale prices are set on each product (optionally scheduled)." actions={<LinkButton href="/admin/promotions/new">+ New coupon</LinkButton>} />
      {sp.saved && <p role="status" className="mb-4 rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">✓ Coupon created.</p>}
      <Table head={["Code", "Discount", "Valid", "Used", "State"]} empty={rows.length ? undefined : "No coupons yet."}>
        {rows.map((c) => { const [t, tone] = state(c); return (
          <tr key={String(c._id)}><td><Link href={`/admin/promotions/${c._id}`} className="font-mono text-sm font-semibold hover:text-brand">{c.code}</Link></td><td>{c.type === "percent" ? `${c.value}%` : `AED ${c.value}`}{c.minSubtotal ? <span className="text-xs text-muted"> · min {c.minSubtotal}</span> : null}</td><td className="text-xs text-muted">{c.startsAt ? dubaiDate(c.startsAt) : "now"} → {c.endsAt ? dubaiDate(c.endsAt) : "no end"}</td><td>{c.usedCount}{c.usageLimit != null ? ` / ${c.usageLimit}` : ""}</td><td><Pill tone={tone}>{t}</Pill></td></tr>
        ); })}
      </Table>
    </>
  );
}
