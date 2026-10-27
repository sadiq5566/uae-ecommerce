"use client";
import { useActionState } from "react";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/i18n";
import { notifyWhenBackAction, type AlertState } from "./actions";

/** Shown instead of the buy buttons when a product / size is sold out. */
export function NotifyWhenBack({ sku, locale, t, email }: { sku: string; locale: Locale; t: Dictionary; email?: string }) {
  const [s, action, pending] = useActionState<AlertState, FormData>(notifyWhenBackAction, {});
  if (s.ok) return <p role="status" className="rounded-xl bg-brand-soft px-4 py-3 text-sm font-medium text-brand">✓ {t.growth.notifyDone}</p>;
  const err = s.error ? ((t.errors as Record<string, string>)[s.error] ?? t.errors.generic) : undefined;
  return (
    <form action={action} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface-2 p-4" noValidate>
      <p className="text-sm font-semibold">🔔 {t.growth.notifyTitle}</p>
      <input type="hidden" name="sku" value={sku} /><input type="hidden" name="locale" value={locale} />
      <div className="flex flex-wrap gap-2">
        {!email && <input name="email" type="email" autoComplete="email" placeholder={t.growth.notifyEmail} aria-label={t.growth.notifyEmail} dir="ltr" className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-brand" />}
        <button disabled={pending} className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-fg transition hover:brightness-110 disabled:opacity-60">{email ? fmtEmail(t.growth.notifyBtnTo, email) : t.growth.notifyBtn}</button>
      </div>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
    </form>
  );
}
const fmtEmail = (s: string, e: string) => s.replace("{email}", e);
