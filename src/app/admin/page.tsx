import Link from "next/link";
import { guard } from "@/lib/admin/guard";
import { parseRange } from "@/lib/admin/range";
import { getDashboard } from "@/features/admin/dashboard";
import { Card, PageHeader, Pill, Stat, aed, dubaiDate } from "@/components/admin/ui";

export const metadata = { title: "Dashboard" };

const RANGES = [["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"]] as const;

export default async function Dashboard({ searchParams }: PageProps<"/admin">) {
  const user = await guard("dashboard:read");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const range = parseRange({ range: str("range"), from: str("from"), to: str("to") });
  const d = await getDashboard(range);
  const max = Math.max(1, ...d.series.map((s) => s.revenue));
  const noData = d.orders === 0;

  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} sub={`Showing ${range.label}`} />
      <form method="get" className="mb-6 flex flex-wrap items-end gap-2" aria-label="Date range">
        <div className="flex flex-wrap gap-1 rounded-full border border-line bg-surface p-1">
          {RANGES.map(([k, label]) => <Link key={k} href={`/admin?range=${k}`} aria-current={range.key === k} className={`rounded-full px-4 py-1.5 text-sm font-medium ${range.key === k ? "bg-brand text-brand-fg" : "hover:bg-surface-2"}`}>{label}</Link>)}
        </div>
        <input type="hidden" name="range" value="custom" />
        <label className="text-xs text-muted">From<input type="date" name="from" defaultValue={str("from")} className="ms-1 rounded-lg border border-line bg-bg px-2 py-1.5 text-sm" /></label>
        <label className="text-xs text-muted">To<input type="date" name="to" defaultValue={str("to")} className="ms-1 rounded-lg border border-line bg-bg px-2 py-1.5 text-sm" /></label>
        <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2">Apply</button>
      </form>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Sales" value={aed(d.revenue)} hint="Total of confirmed → delivered orders" />
        <Stat label="Orders" value={d.orders} hint={`${d.items} items sold`} />
        <Stat label="Avg. order value" value={aed(d.aov)} hint="Sales ÷ orders" />
        <Stat label="Needs attention" value={d.pendingReviews + d.awaitingRefund} tone={d.pendingReviews + d.awaitingRefund ? "red" : undefined} hint={`${d.pendingReviews} reviews · ${d.awaitingRefund} refunds`} />
      </div>
      <p className="mt-2 text-xs text-muted">Definitions: <b>Sales</b> counts orders created in the range with status confirmed, processing, packed, out for delivery or delivered (COD included). Pending-payment, cancelled and refund orders are excluded. Days use UAE time.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Sales per day" className="lg:col-span-2">
          {noData ? <p className="py-10 text-center text-sm text-muted">No sales in this period yet.</p> : (
            <div className="flex h-48 items-end gap-px" role="img" aria-label="Bar chart of daily sales">
              {d.series.map((s) => <div key={s.day} title={`${s.day}: ${aed(s.revenue)} · ${s.orders} orders`} className="group relative flex-1 rounded-t bg-brand/80 transition hover:bg-brand" style={{ height: `${Math.max(2, (s.revenue / max) * 100)}%`, opacity: s.revenue ? 1 : 0.2 }} />)}
            </div>
          )}
          <div className="mt-2 flex justify-between text-xs text-muted"><span>{d.series[0]?.day}</span><span>{d.series.at(-1)?.day}</span></div>
        </Card>
        <Card title="Orders by status">
          <ul className="flex flex-col gap-2 text-sm">
            {Object.entries(d.statusCounts).map(([s, n]) => <li key={s} className="flex justify-between"><span className="capitalize text-muted">{s.replace(/_/g, " ")}</span><span className="font-semibold tabular-nums">{n}</span></li>)}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Best sellers (this period)" actions={<span className="text-xs text-muted">by units</span>}>
          {d.best.length === 0 ? <p className="text-sm text-muted">No sales yet.</p> : <ol className="flex flex-col gap-2 text-sm">{d.best.map((b, i) => <li key={b._id} className="flex justify-between gap-3"><span>{i + 1}. {b.name} <span className="text-xs text-muted">{b._id}</span></span><span className="font-semibold">{b.qty} · {aed(b.revenue)}</span></li>)}</ol>}
        </Card>
        <Card title="Low stock alerts" actions={<Link href="/admin/inventory?low=1" className="text-xs font-semibold text-brand hover:underline">All →</Link>}>
          {d.lowStock.length === 0 ? <p className="text-sm text-muted">Everything is above its threshold. 🎉</p> : <ul className="flex flex-col gap-2 text-sm">{d.lowStock.map((p) => <li key={String(p._id)} className="flex justify-between gap-3"><Link href={`/admin/products/${p._id}`} className="hover:text-brand">{p.name?.en} <span className="text-xs text-muted">{p.sku}</span></Link><Pill tone={p.stock === 0 ? "red" : "gold"}>{p.stock === 0 ? "Out" : `${p.stock} left`}</Pill></li>)}</ul>}
        </Card>
        <Card title="Popular & most viewed (all time)">
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div><p className="mb-2 text-xs font-semibold uppercase text-muted">Most sold</p><ol className="flex flex-col gap-1">{d.popular.map((p) => <li key={String(p._id)} className="flex justify-between gap-2"><span className="truncate">{p.name?.en}</span><b>{p.soldCount}</b></li>)}</ol></div>
            <div><p className="mb-2 text-xs font-semibold uppercase text-muted">Most viewed</p><ol className="flex flex-col gap-1">{d.viewed.map((p) => <li key={String(p._id)} className="flex justify-between gap-2"><span className="truncate">{p.name?.en}</span><b>{p.viewCount}</b></li>)}</ol></div>
          </div>
        </Card>
        <Card title="Recent activity">
          {d.recentOrders.length === 0 && d.recentAudit.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : (
            <ul className="flex flex-col gap-2 text-sm">
              {d.recentOrders.slice(0, 4).map((o) => <li key={o.orderNumber} className="flex justify-between gap-3"><Link href={`/admin/orders/${o.orderNumber}`} className="font-medium hover:text-brand">{o.orderNumber}</Link><span className="text-muted">{aed(o.totals?.total ?? 0)} · {o.status.replace(/_/g, " ")}</span></li>)}
              {d.recentAudit.slice(0, 5).map((a) => <li key={String(a._id)} className="text-muted"><span className="text-fg">{a.summary}</span> · {a.actorEmail} · {dubaiDate(a.createdAt, true)}</li>)}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
