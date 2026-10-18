import Link from "next/link";
import type { PipelineStage } from "mongoose";
import { guard } from "@/lib/admin/guard";
import { connectDb } from "@/lib/db";
import { PageHeader, Pager, Pill, Table, aed, dubaiDate } from "@/components/admin/ui";
import { FilterForm, SortHead, hrefFor, type FilterField } from "@/components/admin/list-ui";
import { day, dayRange, num, oneOf, parsePage, parseSize, parseSort, rx, str } from "@/lib/admin/list";
import { RETURN_REASONS, RETURN_RESOLUTIONS, RETURN_STATUSES, ReturnRequest } from "@/models/return-request";

export const metadata = { title: "Returns" };
const tone = { requested: "gold", approved: "green", received: "green", completed: "dark", rejected: "red", cancelled: "grey" } as const;
const SORTS = { requested: "createdAt", number: "number", order: "orderNumber", customer: "contact.name", type: "resolution", value: "value", status: "status" } as const;
const label = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export default async function ReturnsPage({ searchParams }: PageProps<"/admin/returns">) {
  await guard("orders:read", "/admin/returns");
  const sp = await searchParams;
  const v = { q: str(sp, "q", 60), status: oneOf(str(sp, "status"), RETURN_STATUSES), resolution: oneOf(str(sp, "resolution"), RETURN_RESOLUTIONS), reason: oneOf(str(sp, "reason"), RETURN_REASONS), min: num(sp, "min"), max: num(sp, "max"), from: day(sp, "from"), to: day(sp, "to") };
  const { sort, dir, mongo } = parseSort(sp, Object.keys(SORTS) as (keyof typeof SORTS)[], "requested", "desc");
  const per = parseSize(sp, 25); const page = parsePage(sp);
  await connectDb();
  const m: Record<string, unknown> = {};
  if (v.status) m.status = v.status;
  if (v.resolution) m.resolution = v.resolution;
  if (v.reason) m.reason = v.reason;
  if (v.q) { const re = rx(v.q); m.$or = [{ number: re }, { orderNumber: re }, { "contact.name": re }, { "contact.phone": re }, { "contact.email": re }, { "items.sku": re }, { "items.name.en": re }]; }
  const range = dayRange(v.from, v.to); if (range) m.createdAt = range;
  const pipeline: PipelineStage[] = [{ $match: m }, { $addFields: { value: { $sum: "$items.value" } } }];
  if (v.min || v.max) pipeline.push({ $match: { value: { ...(v.min ? { $gte: Number(v.min) } : {}), ...(v.max ? { $lte: Number(v.max) } : {}) } } });
  const [rows, count, open] = await Promise.all([
    ReturnRequest.aggregate([...pipeline, { $sort: { [SORTS[sort]]: mongo, _id: -1 } }, { $skip: (page - 1) * per }, { $limit: per }]) as Promise<(Awaited<ReturnType<typeof ReturnRequest.findOne>> & { value: number })[]>,
    ReturnRequest.aggregate([...pipeline, { $count: "n" }]) as Promise<{ n: number }[]>,
    ReturnRequest.countDocuments({ status: { $in: ["requested", "approved", "received"] } }),
  ]);
  const total = count[0]?.n ?? 0;
  const c = { base: "/admin/returns", values: v as Record<string, string>, sort, dir, per, defaultSort: "requested", defaultDir: "desc" as const, defaultPer: 25 };
  const fields: FilterField[] = [
    { name: "q", label: "Search", kind: "search", placeholder: "Return no., order, customer, phone, SKU…" },
    { name: "status", label: "Status", kind: "select", options: RETURN_STATUSES.map((x) => ({ value: x, label: label(x) })) },
    { name: "resolution", label: "Type", kind: "select", options: [{ value: "credit", label: "Store credit" }, { value: "exchange", label: "Exchange" }] },
    { name: "reason", label: "Reason", kind: "select", options: RETURN_REASONS.map((x) => ({ value: x, label: label(x) })), more: true },
    { name: "min", label: "Value from (AED)", kind: "number", more: true }, { name: "max", label: "Value to (AED)", kind: "number", more: true },
    { name: "from", label: "Requested from", kind: "date", more: true }, { name: "to", label: "Requested to", kind: "date", more: true },
  ];
  const H = (l: string, field: string) => <SortHead label={l} field={field} {...c} />;
  return (
    <>
      <PageHeader title="Returns & exchanges" sub={`${open} open · ${total} match · free returns within the window set in Settings`} />
      <FilterForm {...c} fields={fields} sorts={[{ value: "requested", label: "Date requested" }, { value: "value", label: "Value" }, { value: "status", label: "Status" }, { value: "customer", label: "Customer" }, { value: "order", label: "Order" }, { value: "type", label: "Type" }, { value: "number", label: "Return number" }]} />
      <Table head={[H("Return", "number"), H("Order", "order"), H("Customer", "customer"), H("Type", "type"), H("Value", "value"), H("Status", "status"), H("Requested", "requested")]} empty={rows.length ? undefined : "No returns match."}>
        {rows.map((r) => r && (
          <tr key={String(r._id)}>
            <td><Link href={`/admin/returns/${r._id}`} className="font-medium text-brand hover:underline">{r.number}</Link></td>
            <td><Link href={`/admin/orders/${r.orderNumber}`} className="hover:text-brand">{r.orderNumber}</Link></td>
            <td className="text-muted">{r.contact.name}</td>
            <td>{r.resolution === "credit" ? "Store credit" : "Exchange"}</td>
            <td>{aed(r.value)}</td>
            <td><Pill tone={tone[r.status]}>{r.status}</Pill></td>
            <td className="text-xs text-muted">{dubaiDate(r.createdAt, true)}</td>
          </tr>
        ))}
      </Table>
      <Pager page={page} pages={Math.max(1, Math.ceil(total / per))} href={(p) => hrefFor(c, { page: p })} />
    </>
  );
}
