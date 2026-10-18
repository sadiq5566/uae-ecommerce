import Link from "next/link";
import { guard } from "@/lib/admin/guard";
import { PageHeader, Pager, Pill, Table, aed, dubaiDate } from "@/components/admin/ui";
import { FilterForm, SortHead, hrefFor, type FilterField } from "@/components/admin/list-ui";
import { Thumb } from "@/components/thumb";
import { ORDER_SORTS, listOrdersAdmin, type OrderFilters } from "@/features/admin/orders/queries";
import { day, num, oneOf, parsePage, parseSize, parseSort, str } from "@/lib/admin/list";
import { EMIRATES } from "@/lib/emirates";
import { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES } from "@/models/order";

export const metadata = { title: "Orders" };
const tone = (s: string) => (s === "delivered" ? "green" : s === "cancelled" || s === "refunded" ? "grey" : s === "pending_payment" || s === "refund_pending" ? "gold" : "green") as "green" | "gold" | "grey";
const label = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const opts = (xs: readonly string[]) => xs.map((x) => ({ value: x, label: label(x) }));

export default async function OrdersAdmin({ searchParams }: PageProps<"/admin/orders">) {
  await guard("orders:read", "/admin/orders");
  const sp = await searchParams;
  const f: OrderFilters = {
    q: str(sp, "q", 60), status: oneOf(str(sp, "status"), ORDER_STATUSES), pay: oneOf(str(sp, "pay"), PAYMENT_STATUSES), method: oneOf(str(sp, "method"), PAYMENT_METHODS),
    emirate: oneOf(str(sp, "emirate"), EMIRATES), source: oneOf(str(sp, "source"), ["cart", "buy_now"]), guest: oneOf(str(sp, "guest"), ["guest", "member"]), coupon: oneOf(str(sp, "coupon"), ["used", "none"]),
    min: num(sp, "min"), max: num(sp, "max"), from: day(sp, "from"), to: day(sp, "to"),
  };
  const { sort, dir, mongo } = parseSort(sp, Object.keys(ORDER_SORTS) as (keyof typeof ORDER_SORTS)[], "placed", "desc");
  const per = parseSize(sp, 25); const page = parsePage(sp);
  const { rows, total, pages } = await listOrdersAdmin(f, sort, mongo, page, per);
  const c = { base: "/admin/orders", values: f as unknown as Record<string, string>, sort, dir, per, defaultSort: "placed", defaultDir: "desc" as const, defaultPer: 25 };
  const fields: FilterField[] = [
    { name: "q", label: "Search", kind: "search", placeholder: "Order no., name, phone, email, SKU, product…" },
    { name: "status", label: "Order status", kind: "select", options: opts(ORDER_STATUSES) },
    { name: "pay", label: "Payment status", kind: "select", options: opts(PAYMENT_STATUSES) },
    { name: "method", label: "Payment method", kind: "select", options: opts(PAYMENT_METHODS), more: true },
    { name: "emirate", label: "Emirate", kind: "select", options: opts(EMIRATES), more: true },
    { name: "source", label: "Placed via", kind: "select", options: [{ value: "cart", label: "Cart" }, { value: "buy_now", label: "Buy now" }], more: true },
    { name: "guest", label: "Customer type", kind: "select", options: [{ value: "guest", label: "Guest" }, { value: "member", label: "Member" }], more: true },
    { name: "coupon", label: "Coupon", kind: "select", options: [{ value: "used", label: "Coupon used" }, { value: "none", label: "No coupon" }], more: true },
    { name: "min", label: "Total from (AED)", kind: "number", more: true }, { name: "max", label: "Total to (AED)", kind: "number", more: true },
    { name: "from", label: "Placed from", kind: "date", more: true }, { name: "to", label: "Placed to", kind: "date", more: true },
  ];
  const H = (l: string, field: string) => <SortHead label={l} field={field} {...c} />;
  return (
    <>
      <PageHeader title="Orders" sub={`${total} order${total === 1 ? "" : "s"}`} />
      <FilterForm {...c} fields={fields} sorts={[{ value: "placed", label: "Date placed" }, { value: "total", label: "Total" }, { value: "status", label: "Order status" }, { value: "payment", label: "Payment status" }, { value: "customer", label: "Customer" }, { value: "emirate", label: "Emirate" }, { value: "order", label: "Order number" }]} />
      <Table head={[H("Order", "order"), H("Customer", "customer"), H("Total", "total"), H("Status", "status"), H("Payment", "payment"), H("Placed", "placed")]} empty={rows.length ? undefined : "No orders match."}>
        {rows.map((o) => (
          <tr key={o.orderNumber}>
            <td><Link href={`/admin/orders/${o.orderNumber}`} className="flex items-center gap-3 hover:text-brand"><Thumb src={o.items[0]?.image} icon={o.items[0]?.icon} size={40} /><span><span className="block font-mono text-xs font-semibold">{o.orderNumber}</span><span className="text-xs text-muted">{o.items.reduce((a, i) => a + i.qty, 0)} item(s)</span></span></Link></td>
            <td><span className="block">{o.address.recipientName}</span><span className="text-xs text-muted">{o.address.emirate.replace(/-/g, " ")}</span></td>
            <td className="font-medium">{aed(o.totals.total)}</td>
            <td><Pill tone={tone(o.status)}>{label(o.status)}</Pill></td>
            <td><span className="text-xs">{o.payment.method === "cod" ? "COD" : o.payment.method.replace(/_/g, " ")} · {label(o.payment.status)}</span></td>
            <td className="text-xs text-muted">{dubaiDate(o.createdAt, true)}</td>
          </tr>
        ))}
      </Table>
      <Pager page={page} pages={pages} href={(p) => hrefFor(c, { page: p })} />
    </>
  );
}
