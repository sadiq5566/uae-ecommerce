"use client";
import { useActionState, useEffect } from "react";
import { captureLeadAction, type LeadState } from "@/features/offers/actions";
import { useToast } from "./toast";

/** Newsletter sign-up: stored as a marketing lead (the visitor is subscribing, so consent is explicit). */
export function NewsletterForm({ t, locale = "en" }: { t: { email: string; subscribe: string; invalid: string; thanks: string }; locale?: string }) {
  const toast = useToast();
  const [s, action, pending] = useActionState<LeadState, FormData>(captureLeadAction, {});
  useEffect(() => { if (s.ok) toast(t.thanks); }, [s.ok]); // eslint-disable-line react-hooks/exhaustive-deps
  const error = !!s.error;
  return (
    <form action={action} noValidate className="flex w-full max-w-md flex-col gap-2">
      <input type="hidden" name="source" value="newsletter" /><input type="hidden" name="locale" value={locale} />
      <div className="flex flex-wrap gap-2">
        <input
          name="email" type="email" autoComplete="email" placeholder={t.email} aria-label={t.email}
          aria-invalid={error} aria-describedby={error ? "nl-err" : undefined}
          className="min-w-40 flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-brand"
        />
        <button disabled={pending} className="rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-gold-fg transition hover:brightness-110 active:scale-95 disabled:opacity-60">{t.subscribe}</button>
      </div>
      {error && <p id="nl-err" role="alert" className="text-sm text-danger">{t.invalid}</p>}
    </form>
  );
}
