"use client";
import { useActionState } from "react";
import { SF, TF } from "@/components/admin/fields";
import { btnPrimary } from "@/components/admin/ui";
import type { FormState } from "@/features/auth/schemas";
import { setRoleAction } from "./actions";

export function RoleForm({ roles }: { roles: { value: string; label: string }[] }) {
  const [s, action, pending] = useActionState<FormState, FormData>(setRoleAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
      <TF s={s} name="email" label="Account email" type="email" className="min-w-64 flex-1" />
      <SF s={s} name="role" label="Role" defaultValue="catalog_manager">{roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</SF>
      <button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : "Set role"}</button>
      {s.ok && <p role="status" className="w-full text-sm text-brand">✓ Role updated. The person is signed out so the change applies immediately.</p>}
      {s.error && <p role="alert" className="w-full text-sm text-danger">{s.error}</p>}
    </form>
  );
}
