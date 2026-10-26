"use client";
import { useActionState } from "react";
import { TF } from "@/components/admin/fields";
import { btnPrimary } from "@/components/admin/ui";
import type { FormState } from "@/features/auth/schemas";
import { grantCreditAction } from "./actions";

export function GrantCreditForm({ id }: { id: string }) {
  const [s, action, pending] = useActionState<FormState, FormData>(grantCreditAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
      <input type="hidden" name="id" value={id} />
      <TF s={s} name="amount" label="Amount (AED)" type="number" className="w-36" />
      <TF s={s} name="note" label="Reason (shown to the customer)" className="min-w-56 flex-1" />
      <button disabled={pending} className={btnPrimary}>{pending ? "Adding…" : "Add web credit"}</button>
      {s.ok && <p role="status" className="w-full text-sm text-brand">✓ Credit added (valid 90 days) and the customer was emailed.</p>}
      {s.error && <p role="alert" className="w-full text-sm text-danger">{s.error}</p>}
    </form>
  );
}
