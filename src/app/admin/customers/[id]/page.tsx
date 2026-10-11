import Link from "next/link";
import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { guard } from "@/lib/admin/guard";
import { can } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db";
import { Card, PageHeader, Pill, aed, btnDanger, btnGhost, dubaiDate } from "@/components/admin/ui";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { setCustomerStatusAction } from "@/features/admin/people/actions";
import { maskEmail } from "@/features/admin/people/mask";
import { Order } from "@/models/order";
import { User } from "@/models/user";

export const metadata = { title: "Customer" };

export default async function CustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  const { id } = await params;
  const viewer = await guard("customers:read", `/admin/customers/${id}`);
  if (!Types.ObjectId.isValid(id)) notFound();
  await connectDb();
  const [u, orders, agg] = await Promise.all([
    User.findById(id).lean(),
    Order.find({ user: id }).sort({ createdAt: -1 }).limit(10).select("orderNumber status totals.total createdAt").lean(),
    Order.aggregate([{ $match: { user: new Types.ObjectId(id), status: { $in: ["confirmed", "processing", "packed", "out_for_delivery", "delivered"] } } }, { $group: { _id: null, n: { $sum: 1 }, spent: { $sum: "$totals.total" } } }]),
  ]);
  if (!u) notFound();
  const owner = can(viewer.role, "users:manage");
  const stats = agg[0] ?? { n: 0, spent: 0 };
  return (
    <>
      <PageHeader title={u.name} sub={owner ? u.email : maskEmail(u.email)} actions={<><Pill tone={u.status === "active" ? "green" : "red"}>{u.status}</Pill>{u.role !== "customer" && <Pill tone="dark">{u.role.replace(/_/g, " ")}</Pill>}</>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Account"><dl className="flex flex-col gap-2 text-sm"><div className="flex justify-between"><dt className="text-muted">Joined</dt><dd>{dubaiDate((u as unknown as { createdAt: Date }).createdAt)}</dd></div><div className="flex justify-between"><dt className="text-muted">Last sign-in</dt><dd>{u.lastLoginAt ? dubaiDate(u.lastLoginAt, true) : "—"}</dd></div><div className="flex justify-between"><dt className="text-muted">Language</dt><dd>{u.locale === "ar" ? "Arabic" : "English"}</dd></div><div className="flex justify-between"><dt className="text-muted">Orders (counted)</dt><dd>{stats.n}</dd></div><div className="flex justify-between"><dt className="text-muted">Lifetime spend</dt><dd>{aed(stats.spent)}</dd></div></dl>
          {owner && u.role === "customer" && String(u._id) !== viewer.id && (
            <form action={setCustomerStatusAction} className="mt-5"><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={u.status === "active" ? "disabled" : "active"} />
              {u.status === "active" ? <ConfirmButton message="Disable this account? They will be signed out everywhere and can't sign in." className={btnDanger}>Disable account</ConfirmButton> : <button className={btnGhost}>Re-enable account</button>}</form>
          )}
          {!owner && <p className="mt-4 text-xs text-muted">Contact details and account controls are limited to owners.</p>}
        </Card>
        <Card title="Recent orders" className="lg:col-span-2">
          {orders.length === 0 ? <p className="text-sm text-muted">No orders yet.</p> : <ul className="flex flex-col gap-2 text-sm">{orders.map((o) => <li key={o.orderNumber} className="flex justify-between gap-3"><Link href={`/admin/orders/${o.orderNumber}`} className="font-mono text-xs font-semibold hover:text-brand">{o.orderNumber}</Link><span className="text-muted">{o.status.replace(/_/g, " ")} · {aed(o.totals?.total ?? 0)} · {dubaiDate(o.createdAt)}</span></li>)}</ul>}
        </Card>
      </div>
    </>
  );
}
