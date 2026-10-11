"use client";
import { useActionState } from "react";
import { btnGhost, inputCls } from "@/components/admin/ui";
import type { FormState } from "@/features/auth/schemas";
import { adjustStockAction } from "./actions";

export function StockForm({ productId, sku }: { productId: string; sku: string }) {
  const [s, action, pending] = useActionState<FormState, FormData>(adjustStockAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5" aria-label={`Adjust stock for ${sku}`}>
      <input type="hidden" name="productId" value={productId} /><input type="hidden" name="sku" value={sku} />
      <select name="mode" defaultValue="delta" aria-label="Mode" className={`${inputCls} !w-auto`}><option value="delta">± change</option><option value="set">set to</option></select>
      <input name="value" type="number" required placeholder="0" aria-label="Quantity" className={`${inputCls} !w-20`} />
      <select name="reason" defaultValue="restock" aria-label="Reason" className={`${inputCls} !w-auto`}><option value="restock">Restock</option><option value="manual_adjustment">Adjustment</option><option value="correction">Stock-take correction</option></select>
      <input name="note" maxLength={200} placeholder="Note (optional)" aria-label="Note" className={`${inputCls} !w-36`} />
      <button disabled={pending} className={btnGhost}>{pending ? "…" : "Apply"}</button>
      {s.ok && <span role="status" className="text-xs text-brand">✓</span>}
      {(s.error || s.fieldErrors?.value) && <span role="alert" className="w-full text-xs text-danger">{s.fieldErrors?.value ?? s.error}</span>}
    </form>
  );
}
