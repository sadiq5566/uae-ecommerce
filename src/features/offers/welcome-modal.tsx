"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { captureLeadAction, type LeadState } from "./actions";

type Labels = {
  eyebrow: string; title: string; lead: string; cta: string; dismiss: string; close: string;
  leadTitle: string; leadHint: string; email: string; phone: string; consent: string; submit: string; thanks: string; errors: Record<string, string>;
};

const KEY = "welcome-offer";
// Pages where an interruption would hurt (payment flow) or isn't storefront content.
const SKIP = /\/(checkout|pay|track|login|register|forgot-password|reset-password)(\/|$)/;

/**
 * Shown once per visitor (per campaign `version`) a moment after landing: current offers + optional email/phone capture.
 * Native <dialog> → focus trap, Esc to close, inert background. localStorage is best-effort (blocked → shows each visit).
 */
export function WelcomeModal({ locale, version, delaySeconds, collectLeads, lines, title, body, labels }: {
  locale: Locale; version: string; delaySeconds: number; collectLeads: boolean; lines: { key: string; icon: string; text: string }[];
  title?: string; body?: string; labels: Labels;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const path = usePathname();
  const [state, action, pending] = useActionState<LeadState, FormData>(captureLeadAction, {});
  const [armed, setArmed] = useState(false);

  const seen = () => { try { return localStorage.getItem(KEY) === version; } catch { return false; } };
  const remember = () => { try { localStorage.setItem(KEY, version); } catch { /* private mode: fine */ } };

  useEffect(() => {
    if (SKIP.test(path) || seen() || armed) return;
    const id = window.setTimeout(() => { if (!ref.current?.open && !document.querySelector("dialog[open]")) { ref.current?.showModal(); setArmed(true); remember(); } }, delaySeconds * 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, delaySeconds, version]);

  const close = () => ref.current?.close();
  const err = state.error ? labels.errors[state.error] ?? labels.errors.generic : undefined;

  return (
    <dialog
      ref={ref} aria-labelledby="wm-title" onClick={(e) => e.target === ref.current && close()}
      className="m-auto w-[min(92vw,30rem)] overflow-hidden rounded-3xl border border-line bg-surface p-0 text-fg shadow-card backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="relative bg-brand px-6 pb-6 pt-8 text-brand-fg">
        <button type="button" onClick={close} aria-label={labels.close} className="absolute end-3 top-3 grid size-9 place-items-center rounded-full bg-white/15 text-lg hover:bg-white/25">✕</button>
        <p className="text-xs font-bold uppercase tracking-widest opacity-90">{labels.eyebrow}</p>
        <h2 id="wm-title" className="mt-1 font-display text-3xl font-bold leading-tight">{title || labels.title}</h2>
        <p className="mt-2 text-sm opacity-90">{body || labels.lead}</p>
      </div>
      <div className="flex flex-col gap-5 p-6">
        <ul className="grid gap-2">
          {lines.filter((l) => l.key !== "cod").map((l) => (
            <li key={l.key} className="flex items-center gap-3 rounded-2xl bg-brand-soft px-4 py-3 text-sm font-semibold text-brand"><span className="text-xl" aria-hidden>{l.icon}</span>{l.text}</li>
          ))}
        </ul>
        {collectLeads && (state.ok ? (
          <p role="status" className="rounded-xl bg-brand-soft px-4 py-3 text-sm font-medium text-brand">✓ {labels.thanks}</p>
        ) : (
          <form action={action} noValidate className="flex flex-col gap-3 border-t border-line pt-5">
            <input type="hidden" name="locale" value={locale} />
            <div><p className="font-semibold">{labels.leadTitle}</p><p className="text-xs text-muted">{labels.leadHint}</p></div>
            <input name="email" type="email" autoComplete="email" placeholder={labels.email} aria-label={labels.email} className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-brand" />
            <input name="phone" type="tel" autoComplete="tel" placeholder={labels.phone} aria-label={labels.phone} className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-brand" />
            <label className="flex items-start gap-2 text-xs text-muted"><input type="checkbox" name="consent" defaultChecked className="mt-0.5 size-4 accent-[var(--brand)]" />{labels.consent}</label>
            {err && <p role="alert" className="text-sm text-danger">{err}</p>}
            <button disabled={pending} className="rounded-xl border border-brand px-5 py-3 text-sm font-semibold text-brand transition hover:bg-brand-soft disabled:opacity-60">{labels.submit}</button>
          </form>
        ))}
        <div className="flex flex-wrap gap-2">
          <Link href={`/${locale}/deals`} onClick={close} className="flex-1 rounded-xl bg-brand px-5 py-3 text-center text-sm font-semibold text-brand-fg transition hover:brightness-110">{labels.cta}</Link>
          <button type="button" onClick={close} className="rounded-xl px-5 py-3 text-sm font-medium text-muted hover:text-fg">{labels.dismiss}</button>
        </div>
      </div>
    </dialog>
  );
}
