import Link from "next/link";
import { guard } from "@/lib/admin/guard";
import { PageHeader, Pager, Pill, Table, aed, btnGhost, dubaiDate, inputCls } from "@/components/admin/ui";
import { listOrdersAdmin } from "@/features/admin/orders/queries";
import { ORDER_STATUSES, PAYMENT_STATUSES } from "@/models/order";

export const metadata = { title: "Orders" };
const tone = (s: string) => (s === "delivered" ? "green" : s === "cancelled" || s === "refunded" ? "grey" : s === "pending_payment" || s === "refund_pending" ? "gold" : "green") as "green" | "gold" | "grey";
const label = (s: string) => s.replace(/_/g, " ");

export default async function OrdersAdmin({ searchParams }: PageProps<"/admin/orders">) {
  await guard("orders:read", "/admin/orders");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const page = Math.max(1, Number(s("page")) || 1);
  const { rows, total, pages } = await listOrdersAdmin({ q: s("q"), status: s("status"), pay: s("pay"), from: s("from"), to: s("to"), page });
  const href = (p: number) => { const u = new URLSearchParams(); for (const k of ["q", "status", "pay", "from", "to"]) if (s(k)) u.set(k, s(k)); u.set("page", String(p)); return `/admin/orders?${u}`; };
  return (
    <>
      <PageHeader title="Orders" sub={`${total} order${total === 1 ? "" : "s"}`} />
      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <input name="q" defaultValue={s("q")} placeholder="Order no., customer email, name, phone" aria-label="Search" className={`${inputCls} max-w-xs`} />
        <select name="status" defaultValue={s("status")} aria-label="Order status" className={`${inputCls} !w-auto`}><option value="">All statuses</option>{ORDER_STATUSES.map((x) => <option key={x} value={x}>{label(x)}</option>)}</select>
        <select name="pay" defaultValue={s("pay")} aria-label="Payment status" className={`${inputCls} !w-auto`}><option value="">All payments</option>{PAYMENT_STATUSES.map((x) => <option key={x} value={x}>{label(x)}</option>)}</select>
        <label className="text-xs text-muted">From<input type="date" name="from" defaultValue={s("from")} className="ms-1 rounded-lg border border-line bg-bg px-2 py-1.5 text-sm" /></label>
        <label className="text-xs text-muted">To<input type="date" name="to" defaultValue={s("to")} className="ms-1 rounded-lg border border-line bg-bg px-2 py-1.5 text-sm" /></label>
        <button className={btnGhost}>Filter</button>
      </form>
      <Table head={["Order", "Customer", "Total", "Status", "Payment", "Placed"]} empty={rows.length ? undefined : "No orders match."}>
        {rows.map((o) => (
          <tr key={o.orderNumber}>
            <td><Link href={`/admin/orders/${o.orderNumber}`} className="font-mono text-xs font-semibold hover:text-brand">{o.orderNumber}</Link></td>
            <td><span className="block">{o.address.recipientName}</span><span className="text-xs text-muted">{o.address.emirate.replace(/-/g, " ")}</span></td>
            <td className="font-medium">{aed(o.totals.total)}</td>
            <td><Pill tone={tone(o.status)}>{label(o.status)}</Pill></td>
            <td><span className="text-xs">{o.payment.method === "cod" ? "COD" : o.payment.method.replace(/_/g, " ")} · {label(o.payment.status)}</span></td>
            <td className="text-xs text-muted">{dubaiDate(o.createdAt, true)}</td>
          </tr>
        ))}
      </Table>
      <Pager page={page} pages={pages} href={href} />
    </>
  );
}
