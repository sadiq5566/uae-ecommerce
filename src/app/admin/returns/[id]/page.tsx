import Link from "next/link";
import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { guard } from "@/lib/admin/guard";
import { can } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db";
import { Card, PageHeader, Pill, aed, dubaiDate } from "@/components/admin/ui";
import { ReturnControls } from "@/features/admin/returns/controls";
import { Thumb } from "@/components/thumb";
import { itemImageMap } from "@/features/orders/queries";
import { ReturnRequest } from "@/models/return-request";

export const metadata = { title: "Return" };
const REASON: Record<string, string> = { wrong_size: "Wrong size", wrong_color: "Wrong colour", defective: "Damaged / defective", not_as_described: "Not as described", changed_mind: "Changed mind", other: "Other" };

export default async function ReturnPage({ params }: PageProps<"/admin/returns/[id]">) {
  const { id } = await params;
  const user = await guard("orders:read", `/admin/returns/${id}`);
  if (!Types.ObjectId.isValid(id)) notFound();
  await connectDb();
  const r = await ReturnRequest.findById(id).lean();
  if (!r) notFound();
  const writable = can(user.role, "orders:write");
  const total = r.items.reduce((a, i) => a + i.value, 0);
  const pics = await itemImageMap(r.items.map((i) => ({ sku: i.sku })));
  return (
    <>
      <PageHeader title={r.number} sub={`Order ${r.orderNumber} · requested ${dubaiDate(r.createdAt, true)}`} actions={<><Pill tone="green">{r.status}</Pill><Pill>{r.resolution === "credit" ? "store credit" : "exchange"}</Pill></>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card title="Items">
            <ul className="flex flex-col gap-3 text-sm">{r.items.map((i) => <li key={i.sku} className="flex items-start gap-3"><Thumb src={pics.get(i.sku)} size={52} /><span className="min-w-0 flex-1">{i.name?.en}{i.variantLabel?.en && <span className="text-muted"> · {i.variantLabel.en}</span>} × {i.qty}<span className="block text-xs text-muted">{i.sku}{i.exchangeSku ? ` → exchange for ${i.exchangeLabel?.en} (${i.exchangeSku})` : ""}</span></span><b>{aed(i.value)}</b></li>)}</ul>
            <p className="mt-4 flex justify-between border-t border-line pt-3 font-bold"><span>Value of returned items</span><span>{aed(total)}</span></p>
            <p className="mt-1 text-xs text-muted">Calculated from what the customer actually paid for the items (after coupon/offer share). Delivery fees aren&apos;t credited.</p>
          </Card>
          {writable && <Card title="Process this return"><ReturnControls id={id} status={r.status} resolution={r.resolution} /></Card>}
          <Card title="Timeline"><ol className="flex flex-col gap-3 border-s border-line ps-4 text-sm">{[...r.timeline].reverse().map((e, i) => <li key={i} className="relative"><span className="absolute -start-[1.4rem] top-1.5 size-2 rounded-full bg-brand" /><p className="font-medium">{e.status}{e.note ? <span className="font-normal text-muted"> — {e.note}</span> : null}</p><p className="text-xs text-muted">{dubaiDate(e.at, true)} · {e.by && /^[a-f0-9]{24}$/.test(e.by) ? "staff" : e.by}</p></li>)}</ol></Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card title="Reason"><p className="text-sm font-medium">{REASON[r.reason]}</p>{r.note && <p className="mt-2 text-sm text-muted">“{r.note}”</p>}</Card>
          <Card title="Customer"><p className="text-sm">{r.contact.name}</p><p className="text-sm text-muted" dir="ltr">{r.contact.phone}</p>{r.contact.email && <p className="text-sm text-muted">{r.contact.email}</p>}<Link href={`/admin/orders/${r.orderNumber}`} className="mt-2 inline-block text-sm font-semibold text-brand hover:underline">View order →</Link></Card>
          {r.creditCode && <Card title="Store credit issued"><p className="font-mono text-lg font-bold tracking-wider">{r.creditCode}</p><p className="text-sm text-muted">{aed(r.creditAmount ?? 0)} · single use · 90 days</p></Card>}
          <Card title="Stock"><p className="text-sm">{r.restocked ? "Returned items were put back in stock." : "Returned items were not restocked."}</p></Card>
        </div>
      </div>
    </>
  );
}
