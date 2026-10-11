import Link from "next/link";
import { guard } from "@/lib/admin/guard";
import { can } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db";
import { escapeRe } from "@/lib/admin/common";
import { PageHeader, Pager, Pill, Table, btnGhost, dubaiDate, inputCls } from "@/components/admin/ui";
import { maskEmail } from "@/features/admin/people/mask";
import { User } from "@/models/user";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  const viewer = await guard("customers:read", "/admin/customers");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const page = Math.max(1, Number(sp.page) || 1);
  await connectDb();
  const f: Record<string, unknown> = { role: "customer" };
  if (q) { const re = new RegExp(escapeRe(q), "i"); f.$or = [{ email: re }, { name: re }]; }
  const [rows, total] = await Promise.all([User.find(f).sort({ createdAt: -1 }).skip((page - 1) * 25).limit(25).select("email name status createdAt lastLoginAt").lean(), User.countDocuments(f)]);
  const full = can(viewer.role, "users:manage");
  return (
    <>
      <PageHeader title="Customers" sub={`${total} account${total === 1 ? "" : "s"} · ${full ? "full contact details visible (owner)" : "email addresses are partially masked"}`} />
      <form className="mb-4 flex gap-2" role="search"><input name="q" defaultValue={q} placeholder="Search name or email…" aria-label="Search" className={`${inputCls} max-w-xs`} /><button className={btnGhost}>Search</button></form>
      <Table head={["Customer", "Email", "Status", "Joined", "Last sign-in"]} empty={rows.length ? undefined : "No customers found."}>
        {rows.map((u) => <tr key={String(u._id)}><td><Link href={`/admin/customers/${u._id}`} className="font-medium hover:text-brand">{u.name}</Link></td><td className="text-muted">{full ? u.email : maskEmail(u.email)}</td><td><Pill tone={u.status === "active" ? "green" : "red"}>{u.status}</Pill></td><td className="text-xs text-muted">{dubaiDate((u as unknown as { createdAt: Date }).createdAt)}</td><td className="text-xs text-muted">{u.lastLoginAt ? dubaiDate(u.lastLoginAt) : "—"}</td></tr>)}
      </Table>
      <Pager page={page} pages={Math.max(1, Math.ceil(total / 25))} href={(p) => `/admin/customers?${new URLSearchParams({ ...(q && { q }), page: String(p) })}`} />
    </>
  );
}
