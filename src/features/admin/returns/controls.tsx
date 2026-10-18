"use client";
import { useActionState } from "react";
import { btnDanger, btnPrimary, inputCls } from "@/components/admin/ui";
import type { FormState } from "@/features/auth/schemas";
import { completeReturnAction, receiveReturnAction, reviewReturnAction } from "./actions";

function Msg({ s }: { s: FormState }) {
  return <>{s.ok && <p role="status" className="text-sm text-brand">✓ Done. {s.values?.message}</p>}{s.error && <p role="alert" className="text-sm text-danger">{s.error}</p>}</>;
}

export function ReturnControls({ id, status, resolution }: { id: string; status: string; resolution: string }) {
  const [a, review, p1] = useActionState<FormState, FormData>(reviewReturnAction, {});
  const [b, receive, p2] = useActionState<FormState, FormData>(receiveReturnAction, {});
  const [c, complete, p3] = useActionState<FormState, FormData>(completeReturnAction, {});
  if (status === "requested") return (
    <form action={review} className="flex flex-col gap-3"><input type="hidden" name="id" value={id} />
      <input name="note" aria-label="Note to customer" maxLength={300} placeholder="Note to customer (required to reject)" className={inputCls} />
      <div className="flex flex-wrap gap-2"><button name="to" value="approved" disabled={p1} className={btnPrimary}>Approve return</button><button name="to" value="rejected" disabled={p1} className={btnDanger}>Reject</button></div><Msg s={a} /></form>
  );
  if (status === "approved") return (
    <form action={receive} className="flex flex-col gap-3"><input type="hidden" name="id" value={id} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="restock" defaultChecked className="size-4 accent-[var(--brand)]" />Put the items back in stock (untick if damaged)</label>
      <input name="note" aria-label="Note" maxLength={300} placeholder="Condition notes (optional)" className={inputCls} />
      <div><button disabled={p2} className={btnPrimary}>Mark items received</button></div><Msg s={b} /></form>
  );
  if (status === "received") return (
    <form action={complete} className="flex flex-col gap-3"><input type="hidden" name="id" value={id} />
      <p className="text-sm text-muted">{resolution === "credit" ? "Completing issues a single-use store-credit coupon (valid 90 days) worth the returned items and sends it to the customer." : "Completing takes the replacement size/colour from stock and notifies the customer. Dispatch it with a courier at no charge."}</p>
      <div><button disabled={p3} className={btnPrimary}>{resolution === "credit" ? "Issue store credit & complete" : "Dispatch exchange & complete"}</button></div><Msg s={c} /></form>
  );
  return <p className="text-sm text-muted">No further actions — this return is {status}.</p>;
}
