"use client";
import { useActionState, useState } from "react";
import { TF } from "@/components/admin/fields";
import { btnPrimary, inputCls } from "@/components/admin/ui";
import type { FormState } from "@/features/auth/schemas";
import { adjustCreditAction } from "./actions";

/** Add or remove web credit. On a customer's own page pass `id`; on the Web credit page pass nothing (or a prefilled `email`). */
export function AdjustCreditForm({ id, email }: { id?: string; email?: string }) {
  const [s, action, pending] = useActionState<FormState, FormData>(adjustCreditAction, {});
  const [kind, setKind] = useState<"add" | "deduct">("add");
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      {id && <input type="hidden" name="id" value={id} />}
      {!id && <TF s={s} name="email" label="Customer email" type="email" defaultValue={email} className="sm:col-span-2" />}
      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 text-sm font-medium">What do you want to do?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([["add", "＋ Add credit", "Goodwill, apology, correction in the customer's favour."], ["deduct", "− Remove credit", "A wrong grant or a clawback. Takes from the soonest-expiring credit first, never below zero."]] as const).map(([v, label, hint]) => (
            <label key={v} className={`cursor-pointer rounded-xl border p-3 text-sm transition ${kind === v ? (v === "add" ? "border-brand bg-brand-soft" : "border-danger bg-danger/10") : "border-line hover:bg-surface-2"}`}>
              <input type="radio" name="kind" value={v} checked={kind === v} onChange={() => setKind(v)} className="sr-only" />
              <b className="block">{label}</b><span className="text-xs text-muted">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <TF s={s} name="amount" label="Amount (AED)" type="number" step="0.01" min="0.01" max="5000" />
      <div>
        <label htmlFor="credit-note" className="mb-1.5 block text-sm font-medium">Reason</label>
        <input id="credit-note" name="note" defaultValue={s.values?.note} maxLength={200} aria-invalid={!!s.fieldErrors?.note} className={inputCls} placeholder={kind === "add" ? "e.g. Late delivery apology" : "e.g. Credit added twice by mistake"} />
        {s.fieldErrors?.note && <p role="alert" className="mt-1.5 text-sm text-danger">{s.fieldErrors.note}</p>}
      </div>
      <label key={kind} className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="notify" defaultChecked={kind === "add"} className="size-4 accent-[var(--brand)]" />Email the customer about this (the reason is included)</label>
      <div className="sm:col-span-2">
        <button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : kind === "add" ? "Add web credit" : "Remove web credit"}</button>
        <p className="mt-2 text-xs text-muted">Your name and the time are saved with every change and can&apos;t be edited afterwards.</p>
      </div>
      {s.ok && <p role="status" className="text-sm text-brand sm:col-span-2">✓ {s.values?.message ?? "Done."}</p>}
      {s.error && <p role="alert" className="text-sm text-danger sm:col-span-2">{s.error}</p>}
    </form>
  );
}
