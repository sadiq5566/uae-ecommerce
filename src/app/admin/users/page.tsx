import { guard } from "@/lib/admin/guard";
import { connectDb } from "@/lib/db";
import { ROLE_PERMISSIONS } from "@/lib/auth/permissions";
import { Card, PageHeader, Pill, Table, dubaiDate } from "@/components/admin/ui";
import { FilterForm, SortHead, type FilterField } from "@/components/admin/list-ui";
import { oneOf, parseSort, rx, str } from "@/lib/admin/list";
import { RoleForm } from "@/features/admin/people/role-form";
import { ROLES, User } from "@/models/user";

export const metadata = { title: "Staff & roles" };
const names: Record<string, string> = { owner: "Owner / Admin", catalog_manager: "Catalogue manager", operations_manager: "Operations manager", content_editor: "Content editor", customer: "Customer (no admin access)" };

const SORTS = { name: "name", email: "email", role: "role", status: "status", login: "lastLoginAt" } as const;

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  await guard("users:manage", "/admin/users");
  const sp = await searchParams;
  const v = { q: str(sp, "q"), role: oneOf(str(sp, "role"), ROLES.filter((r) => r !== "customer")), status: oneOf(str(sp, "status"), ["active", "disabled"]) };
  const { sort, dir, mongo } = parseSort(sp, Object.keys(SORTS) as (keyof typeof SORTS)[], "role", "asc");
  await connectDb();
  const f: Record<string, unknown> = { role: v.role ? v.role : { $ne: "customer" } };
  if (v.q) { const re = rx(v.q); f.$or = [{ name: re }, { email: re }]; }
  if (v.status) f.status = v.status;
  const staff = await User.find(f).sort({ [SORTS[sort]]: mongo, name: 1 }).limit(200).select("email name role status lastLoginAt").lean();
  const c = { base: "/admin/users", values: v as Record<string, string>, sort, dir, defaultSort: "role", defaultDir: "asc" as const };
  const fields: FilterField[] = [
    { name: "q", label: "Search", kind: "search", placeholder: "Name or email…" },
    { name: "role", label: "Role", kind: "select", options: ROLES.filter((r) => r !== "customer").map((r) => ({ value: r, label: names[r] })) },
    { name: "status", label: "Status", kind: "select", options: [{ value: "active", label: "Active" }, { value: "disabled", label: "Disabled" }] },
  ];
  const H = (l: string, field: string) => <SortHead label={l} field={field} {...c} />;
  return (
    <>
      <PageHeader title="Staff & roles" sub="Roles are enforced on the server for every page and action." />
      <Card title="Assign a role" className="mb-6"><RoleForm roles={ROLES.map((r) => ({ value: r, label: names[r] }))} /></Card>
      <FilterForm {...c} sizes={false} fields={fields} sorts={[{ value: "role", label: "Role" }, { value: "name", label: "Name" }, { value: "email", label: "Email" }, { value: "status", label: "Status" }, { value: "login", label: "Last sign-in" }]} />
      <Table head={[H("Name", "name"), H("Email", "email"), H("Role", "role"), H("Status", "status"), H("Last sign-in", "login")]} empty={staff.length ? undefined : "No staff match."}>
        {staff.map((u) => <tr key={String(u._id)}><td className="font-medium">{u.name}</td><td className="text-muted">{u.email}</td><td><Pill tone="dark">{names[u.role]}</Pill></td><td><Pill tone={u.status === "active" ? "green" : "red"}>{u.status}</Pill></td><td className="text-xs text-muted">{u.lastLoginAt ? dubaiDate(u.lastLoginAt) : "—"}</td></tr>)}
      </Table>
      <Card title="What each role can do" className="mt-6">
        <ul className="grid gap-3 text-sm sm:grid-cols-2">{ROLES.filter((r) => r !== "customer").map((r) => <li key={r}><b>{names[r]}</b><span className="block text-xs text-muted">{ROLE_PERMISSIONS[r].join(", ")}</span></li>)}</ul>
      </Card>
    </>
  );
}
