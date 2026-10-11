import { guard } from "@/lib/admin/guard";
import { connectDb } from "@/lib/db";
import { ROLE_PERMISSIONS } from "@/lib/auth/permissions";
import { Card, PageHeader, Pill, Table, dubaiDate } from "@/components/admin/ui";
import { RoleForm } from "@/features/admin/people/role-form";
import { ROLES, User } from "@/models/user";

export const metadata = { title: "Staff & roles" };
const names: Record<string, string> = { owner: "Owner / Admin", catalog_manager: "Catalogue manager", operations_manager: "Operations manager", content_editor: "Content editor", customer: "Customer (no admin access)" };

export default async function UsersPage() {
  await guard("users:manage", "/admin/users");
  await connectDb();
  const staff = await User.find({ role: { $ne: "customer" } }).sort({ role: 1, name: 1 }).select("email name role status lastLoginAt").lean();
  return (
    <>
      <PageHeader title="Staff & roles" sub="Roles are enforced on the server for every page and action." />
      <Card title="Assign a role" className="mb-6"><RoleForm roles={ROLES.map((r) => ({ value: r, label: names[r] }))} /></Card>
      <Table head={["Name", "Email", "Role", "Status", "Last sign-in"]} empty={staff.length ? undefined : "No staff yet."}>
        {staff.map((u) => <tr key={String(u._id)}><td className="font-medium">{u.name}</td><td className="text-muted">{u.email}</td><td><Pill tone="dark">{names[u.role]}</Pill></td><td><Pill tone={u.status === "active" ? "green" : "red"}>{u.status}</Pill></td><td className="text-xs text-muted">{u.lastLoginAt ? dubaiDate(u.lastLoginAt) : "—"}</td></tr>)}
      </Table>
      <Card title="What each role can do" className="mt-6">
        <ul className="grid gap-3 text-sm sm:grid-cols-2">{ROLES.filter((r) => r !== "customer").map((r) => <li key={r}><b>{names[r]}</b><span className="block text-xs text-muted">{ROLE_PERMISSIONS[r].join(", ")}</span></li>)}</ul>
      </Card>
    </>
  );
}
