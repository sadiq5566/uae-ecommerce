import Link from "next/link";
import { guard } from "@/lib/admin/guard";
import { can } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db";
import { PageHeader, Pager, Pill, Table, dubaiDate } from "@/components/admin/ui";
import { FilterForm, SortHead, hrefFor, type FilterField } from "@/components/admin/list-ui";
import { day, dayRange, oneOf, parsePage, parseSize, parseSort, rx, str } from "@/lib/admin/list";
import { maskEmail } from "@/features/admin/people/mask";
import { User } from "@/models/user";

export const metadata = { title: "Customers" };
const SORTS = { name: "name", email: "email", status: "status", joined: "createdAt", login: "lastLoginAt" } as const;

export default async function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  const viewer = await guard("customers:read", "/admin/customers");
  const sp = await searchParams;
  const v = { q: str(sp, "q"), status: oneOf(str(sp, "status"), ["active", "disabled"]), login: oneOf(str(sp, "login"), ["ever", "never"]), from: day(sp, "from"), to: day(sp, "to"), lfrom: day(sp, "lfrom"), lto: day(sp, "lto") };
  const { sort, dir, mongo } = parseSort(sp, Object.keys(SORTS) as (keyof typeof SORTS)[], "joined", "desc");
  const per = parseSize(sp, 25); const page = parsePage(sp);
  await connectDb();
  const f: Record<string, unknown> = { role: "customer" };
  if (v.q) { const re = rx(v.q); f.$or = [{ email: re }, { name: re }, { phone: re }]; }
  if (v.status) f.status = v.status;
  const joined = dayRange(v.from, v.to); if (joined) f.createdAt = joined;
  const seen = dayRange(v.lfrom, v.lto);
  if (seen) f.lastLoginAt = seen; else if (v.login === "never") f.lastLoginAt = null; else if (v.login === "ever") f.lastLoginAt = { $ne: null };
  const [rows, total] = await Promise.all([User.find(f).sort({ [SORTS[sort]]: mongo, _id: 1 }).skip((page - 1) * per).limit(per).select("email name status createdAt lastLoginAt").lean(), User.countDocuments(f)]);
  const full = can(viewer.role, "users:manage");
  const c = { base: "/admin/customers", values: v as Record<string, string>, sort, dir, per, defaultSort: "joined", defaultDir: "desc" as const, defaultPer: 25 };
  const fields: FilterField[] = [
    { name: "q", label: "Search", kind: "search", placeholder: "Name, email or phone…" },
    { name: "status", label: "Status", kind: "select", options: [{ value: "active", label: "Active" }, { value: "disabled", label: "Disabled" }] },
    { name: "login", label: "Sign-in", kind: "select", options: [{ value: "ever", label: "Has signed in" }, { value: "never", label: "Never signed in" }] },
    { name: "from", label: "Joined from", kind: "date", more: true }, { name: "to", label: "Joined to", kind: "date", more: true },
    { name: "lfrom", label: "Last sign-in from", kind: "date", more: true }, { name: "lto", label: "Last sign-in to", kind: "date", more: true },
  ];
  const H = (l: string, field: string) => <SortHead label={l} field={field} {...c} />;
  return (
    <>
      <PageHeader title="Customers" sub={`${total} account${total === 1 ? "" : "s"} · ${full ? "full contact details visible (owner)" : "email addresses are partially masked"}`} />
      <FilterForm {...c} fields={fields} sorts={[{ value: "joined", label: "Joined" }, { value: "login", label: "Last sign-in" }, { value: "name", label: "Name" }, { value: "email", label: "Email" }, { value: "status", label: "Status" }]} />
      <Table head={[H("Customer", "name"), H("Email", "email"), H("Status", "status"), H("Joined", "joined"), H("Last sign-in", "login")]} empty={rows.length ? undefined : "No customers found."}>
        {rows.map((u) => <tr key={String(u._id)}><td><Link href={`/admin/customers/${u._id}`} className="font-medium hover:text-brand">{u.name}</Link></td><td className="text-muted">{full ? u.email : maskEmail(u.email)}</td><td><Pill tone={u.status === "active" ? "green" : "red"}>{u.status}</Pill></td><td className="text-xs text-muted">{dubaiDate((u as unknown as { createdAt: Date }).createdAt)}</td><td className="text-xs text-muted">{u.lastLoginAt ? dubaiDate(u.lastLoginAt) : "—"}</td></tr>)}
      </Table>
      <Pager page={page} pages={Math.max(1, Math.ceil(total / per))} href={(p) => hrefFor(c, { page: p })} />
    </>
  );
}
