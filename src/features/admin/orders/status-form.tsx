"use client";
import { useActionState } from "react";
import { btnGhost, btnPrimary, inputCls } from "@/components/admin/ui";
import type { FormState } from "@/features/auth/schemas";
import { changeStatusAction, completeManualRefundAction, requestRefundAction } from "./actions";

const label = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function Msg({ s }: { s: FormState }) {
  return <>{s.ok && <p role="status" className="text-sm text-brand">✓ Done. {s.values?.message}</p>}{s.error && <p role="alert" className="text-sm text-danger">{s.error}</p>}</>;
}

export function StatusForm({ orderNumber, next, status }: { orderNumber: string; next: string[]; status?: string }) {
  const [s, action, pending] = useActionState<FormState, FormData>(changeStatusAction, {});
  const options = next.filter((n) => n !== "refund_pending" && n !== "refunded"); // refunds have their own form below
  if (options.length === 0) {
    const refundable = next.includes("refund_pending");
    return (
      <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">
        {status ? <>This order is <b className="text-fg">{label(status)}</b>. </> : null}
        {refundable ? "There are no further status steps. If the customer needs their money back, use “Start refund” in the Refunds section below." : "This is a final status — there is nothing more to update."}
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <div className="flex flex-wrap gap-2">
        <select name="to" aria-label="New status" className={`${inputCls} !w-auto`} defaultValue={options[0]}>{options.map((n) => <option key={n} value={n}>{label(n)}</option>)}</select>
        <input name="note" aria-label="Note" maxLength={300} placeholder="Note (required for cancellation)" className={`${inputCls} min-w-56 flex-1`} />
        <button disabled={pending} className={btnPrimary}>{pending ? "Saving…" : "Update status"}</button>
      </div>
      <Msg s={s} />
    </form>
  );
}

export function RefundForms({ orderNumber, canRequest, canComplete, cod }: { orderNumber: string; canRequest: boolean; canComplete: boolean; cod: boolean }) {
  const [a, reqAction, p1] = useActionState<FormState, FormData>(requestRefundAction, {});
  const [b, doneAction, p2] = useActionState<FormState, FormData>(completeManualRefundAction, {});
  return (
    <div className="flex flex-col gap-4">
      {canRequest && (
        <form action={reqAction} className="flex flex-col gap-2"><input type="hidden" name="orderNumber" value={orderNumber} />
          <div className="flex flex-wrap gap-2"><input name="note" aria-label="Refund reason" placeholder="Reason for refund" maxLength={300} className={`${inputCls} min-w-56 flex-1`} /><button disabled={p1} className={btnGhost}>Start refund</button></div><Msg s={a} /></form>
      )}
      {canComplete && (
        <form action={doneAction} className="flex flex-col gap-2"><input type="hidden" name="orderNumber" value={orderNumber} />
          <p className="text-xs text-muted">{cod ? "For cash refunds: record the receipt/reference once the money has been returned." : "Online payments are completed automatically when the provider confirms. Owners can record a manual refund with a reference."}</p>
          <div className="flex flex-wrap gap-2"><input name="note" aria-label="Refund reference" placeholder="Reference (receipt / transfer no.)" maxLength={300} className={`${inputCls} min-w-56 flex-1`} /><button disabled={p2} className={btnGhost}>Mark refund completed</button></div><Msg s={b} /></form>
      )}
    </div>
  );
}
