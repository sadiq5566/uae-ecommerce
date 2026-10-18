import Link from "next/link";
import { notFound } from "next/navigation";
import { guard } from "@/lib/admin/guard";
import { can } from "@/lib/auth/permissions";
import { Card, PageHeader, Pill, aed, dubaiDate } from "@/components/admin/ui";
import { Thumb } from "@/components/thumb";
import { getOrderAdmin } from "@/features/admin/orders/queries";
import { itemImageMap } from "@/features/orders/queries";
import { RefundForms, StatusForm } from "@/features/admin/orders/status-form";
import { isPaid, nextStatuses } from "@/features/orders/status";

export const metadata = { title: "Order" };
const label = (s: string) => s.replace(/_/g, " ");

export default async function OrderAdmin({ params }: PageProps<"/admin/orders/[number]">) {
  const { number } = await params;
  const user = await guard("orders:read", `/admin/orders/${number}`);
  const o = await getOrderAdmin(number);
  if (!o) notFound();
  const writable = can(user.role, "orders:write");
  const pics = await itemImageMap(o.items.map((i) => ({ sku: i.sku, image: (i as { image?: string }).image })));
  const next = nextStatuses(o.status, o.payment.status);
  const T = o.totals; const row = "flex justify-between gap-4 text-sm";
  const canRequestRefund = writable && isPaid(o.payment.status) && next.includes("refund_pending");
  const canComplete = writable && o.status === "refund_pending";
  return (
    <>
      <PageHeader title={o.orderNumber} sub={`Placed ${dubaiDate(o.createdAt, true)} · ${o.locale === "ar" ? "Arabic" : "English"} customer`} actions={<><Pill tone="green">{label(o.status)}</Pill><Pill tone={isPaid(o.payment.status) ? "green" : "gold"}>{label(o.payment.status)}</Pill></>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card title="Items (snapshot at purchase)">
            <ul className="flex flex-col gap-3 text-sm">{o.items.map((i) => <li key={i.sku} className="flex items-start gap-3"><Thumb src={pics.get(i.sku)} icon={(i as { icon?: string }).icon} size={52} /><span className="min-w-0 flex-1">{i.name?.en} {i.variantLabel?.en && <span className="text-muted">· {i.variantLabel.en}</span>}<span className="block text-xs text-muted">{i.sku} · {aed(i.unitPrice)} × {i.qty}</span></span><b>{aed(i.lineTotal)}</b></li>)}</ul>
            <dl className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
              <div className={row}><dt>Items subtotal</dt><dd>{aed(T.subtotal)}</dd></div>
              {T.itemDiscounts > 0 && <div className={`${row} text-muted`}><dt>Sale savings (already included)</dt><dd>{aed(T.itemDiscounts)}</dd></div>}
              {T.couponDiscount > 0 && <div className={row}><dt>Coupon {o.coupon?.code}</dt><dd>−{aed(T.couponDiscount)}</dd></div>}
              {(T.offerDiscount ?? 0) > 0 && <div className={row}><dt>Auto offer: {o.offer?.kind === "first_order" ? "first order" : "spend discount"} ({o.offer?.percent}%)</dt><dd>−{aed(T.offerDiscount ?? 0)}</dd></div>}
              <div className={row}><dt>Delivery ({o.delivery.zoneName?.en})</dt><dd>{T.deliveryFee ? aed(T.deliveryFee) : "Free"}</dd></div>
              {T.codFee > 0 && <div className={row}><dt>COD fee</dt><dd>{aed(T.codFee)}</dd></div>}
              {T.tax > 0 && <div className={`${row} text-muted`}><dt>VAT {T.taxIncluded ? "(included)" : ""}</dt><dd>{aed(T.tax)}</dd></div>}
              <div className="flex justify-between border-t border-line pt-3 font-bold"><dt>Total</dt><dd className="text-lg">{aed(T.total)}</dd></div>
            </dl>
          </Card>
          {writable && (
            <Card title="Update order">
              <StatusForm orderNumber={o.orderNumber} next={next} status={o.status} />
              {(canRequestRefund || canComplete) && <div className="mt-6 border-t border-line pt-5"><h3 className="mb-3 text-sm font-semibold">Refunds</h3><RefundForms orderNumber={o.orderNumber} canRequest={canRequestRefund} canComplete={canComplete} cod={o.payment.method === "cod"} /></div>}
              <p className="mt-4 text-xs text-muted">Cancelling before dispatch returns stock to inventory and gives back any coupon use. A refund is only shown as completed after the payment provider confirms it (or a manual reference is recorded).</p>
            </Card>
          )}
          <Card title="Timeline">
            <ol className="flex flex-col gap-3 border-s border-line ps-4 text-sm">{[...o.timeline].reverse().map((e, i) => <li key={i} className="relative"><span className="absolute -start-[1.4rem] top-1.5 size-2 rounded-full bg-brand" /><p className="font-medium">{label(e.status ?? "")}{e.note ? <span className="font-normal text-muted"> — {e.note}</span> : null}</p><p className="text-xs text-muted">{dubaiDate(e.at, true)} · {e.by && /^[a-f0-9]{24}$/.test(e.by) ? "staff" : e.by}</p></li>)}</ol>
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card title="Delivery"><address className="text-sm not-italic leading-relaxed">{o.address.recipientName}<br /><span dir="ltr">{o.address.phone}</span><br />{[o.address.unit, o.address.building, o.address.street, o.address.area].filter(Boolean).join(", ")}<br />{o.address.emirate.replace(/-/g, " ")}{o.address.landmark && <><br />Near {o.address.landmark}</>}{o.address.instructions && <><br /><i>“{o.address.instructions}”</i></>}</address><p className="mt-3 text-xs text-muted">Estimate shown to customer: {o.delivery.estimate?.en}</p></Card>
          <Card title="Payment"><dl className="flex flex-col gap-1.5 text-sm"><div className={row}><dt className="text-muted">Method</dt><dd>{label(o.payment.method)}</dd></div><div className={row}><dt className="text-muted">Status</dt><dd>{label(o.payment.status)}</dd></div>{o.payment.provider && <div className={row}><dt className="text-muted">Provider</dt><dd>{o.payment.provider}</dd></div>}{o.payment.providerRef && <div className={row}><dt className="text-muted">Reference</dt><dd className="break-all font-mono text-xs">{o.payment.providerRef}</dd></div>}{o.payment.paidAt && <div className={row}><dt className="text-muted">Paid at</dt><dd>{dubaiDate(o.payment.paidAt, true)}</dd></div>}{o.payment.failureReason && <div className={row}><dt className="text-muted">Failure</dt><dd>{o.payment.failureReason}</dd></div>}</dl></Card>
          <Card title="Customer">{o.guest && <p className="mb-1"><Pill tone="gold">Guest checkout</Pill></p>}<p className="text-sm">{o.address.recipientName}</p><p className="text-sm text-muted" dir="ltr">{o.address.phone}</p><p className="text-sm text-muted">{o.email ?? "No email given"}</p>{o.source === "buy_now" && <p className="mt-1 text-xs text-muted">Placed via Buy now</p>}<p className="mt-1 text-xs text-muted">Stock reserved: {o.stockReserved ? "yes" : "no"}</p>{o.user && can(user.role, "customers:read") && <Link href={`/admin/customers/${o.user}`} className="mt-2 inline-block text-sm font-semibold text-brand hover:underline">View customer →</Link>}</Card>
        </div>
      </div>
    </>
  );
}
