"use client";
import { Thumb } from "@/components/thumb";
import { useActionState, useState } from "react";
import type { Dictionary } from "@/lib/dictionaries";
import { fmt } from "@/lib/format";
import { inputCls, SubmitButton } from "@/components/form-ui";
import type { Locale } from "@/lib/i18n";
import { submitReturnAction, type ReturnFormState } from "./actions";

export type ReturnLine = { sku: string; name: string; variant?: string; image?: string; max: number; options: { sku: string; label: string; stock: number }[] };
const REASONS = ["wrong_size", "wrong_color", "defective", "not_as_described", "changed_mind", "other"] as const;

export function ReturnForm({ orderNumber, token, lines, t }: { orderNumber: string; token?: string; lines: ReturnLine[]; locale: Locale; t: Dictionary }) {
  const [s, action, pending] = useActionState<ReturnFormState, FormData>(submitReturnAction, {});
  const [resolution, setResolution] = useState<"credit" | "exchange">("credit");
  const canExchange = lines.some((l) => l.options.length > 0);
  if (s.ok) return <p role="status" className="rounded-xl bg-brand-soft px-4 py-3 text-sm font-medium text-brand">✓ {fmt(t.returns.submitted, { n: s.number ?? "" })}</p>;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="orderNumber" value={orderNumber} />{token && <input type="hidden" name="token" value={token} />}
      {s.error && <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{t.returns.errors[s.error as keyof typeof t.returns.errors] ?? t.errors.generic}</p>}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">{t.returns.whichItems}</legend>
        {lines.map((l) => (
          <div key={l.sku} className="grid gap-2 rounded-xl border border-line p-3 text-sm sm:grid-cols-[minmax(0,1fr)_6rem]">
            <div className="flex min-w-0 items-center gap-3"><Thumb src={l.image} size={48} /><div className="min-w-0"><p className="line-clamp-2 font-medium">{l.name}</p>{l.variant && <p className="text-xs text-muted">{l.variant}</p>}</div></div>
            <label className="flex items-center gap-2 sm:justify-end"><span className="text-xs text-muted">{t.returns.qty}</span>
              <select name={`qty_${l.sku}`} defaultValue="0" className={`${inputCls} !w-20 !py-2`} aria-label={`${t.returns.qty}: ${l.name}`}>
                {Array.from({ length: l.max + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
              </select></label>
            {resolution === "exchange" && (
              <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-xs text-muted">{t.returns.exchangeFor}</span>
                <select name={`exchange_${l.sku}`} defaultValue="" className={`${inputCls} !py-2`} disabled={l.options.length === 0}>
                  <option value="" disabled>{l.options.length ? t.returns.pickVariant : t.returns.noVariants}</option>
                  {l.options.map((o) => <option key={o.sku} value={o.sku} disabled={o.stock < 1}>{o.label}{o.stock < 1 ? ` — ${t.catalog.outOfStock}` : ""}</option>)}
                </select></label>
            )}
          </div>
        ))}
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t.returns.resolution}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([["credit", t.returns.credit, t.returns.creditNote], ["exchange", t.returns.exchange, canExchange ? t.returns.exchangeNote : t.returns.noVariants]] as const).map(([v, label, note]) => (
            <label key={v} className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${resolution === v ? "border-brand bg-brand-soft" : "border-line"} ${v === "exchange" && !canExchange ? "opacity-50" : ""}`}>
              <input type="radio" name="resolution" value={v} checked={resolution === v} disabled={v === "exchange" && !canExchange} onChange={() => setResolution(v)} className="mt-1 accent-[var(--brand)]" />
              <span><span className="block font-semibold">{label}</span><span className="block text-xs text-muted">{note}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="text-sm"><span className="mb-1.5 block font-medium">{t.returns.reason}</span>
        <select name="reason" defaultValue="" required className={inputCls}><option value="" disabled>{t.address.select}</option>{REASONS.map((r) => <option key={r} value={r}>{t.returns.reasons[r]}</option>)}</select></label>
      <label className="text-sm"><span className="mb-1.5 block font-medium">{t.returns.note}</span><textarea name="note" rows={2} maxLength={500} className={inputCls} /></label>
      <div className="max-w-xs"><SubmitButton pending={pending}>{t.returns.submit}</SubmitButton></div>
    </form>
  );
}
