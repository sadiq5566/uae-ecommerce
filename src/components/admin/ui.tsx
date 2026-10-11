import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="font-display text-2xl font-bold sm:text-3xl">{title}</h1>{sub && <p className="mt-1 text-sm text-muted">{sub}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export const Card = ({ title, children, className = "", actions }: { title?: string; children: ReactNode; className?: string; actions?: ReactNode }) => (
  <section className={`rounded-2xl border border-line bg-surface p-5 ${className}`}>
    {(title || actions) && <div className="mb-4 flex items-center justify-between gap-3">{title && <h2 className="font-semibold">{title}</h2>}{actions}</div>}
    {children}
  </section>
);

export const btn = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50";
export const btnPrimary = `${btn} bg-brand text-brand-fg hover:brightness-110`;
export const btnGhost = `${btn} border border-line hover:bg-surface-2`;
export const btnDanger = `${btn} border border-danger/40 text-danger hover:bg-danger/10`;

export function LinkButton({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "ghost" }) {
  return <Link href={href} className={variant === "primary" ? btnPrimary : btnGhost}>{children}</Link>;
}

const tones: Record<string, string> = {
  green: "bg-brand-soft text-brand", gold: "bg-gold-soft text-gold", red: "bg-danger/15 text-danger", grey: "bg-surface-2 text-muted", dark: "bg-fg text-bg",
};
export const Pill = ({ tone = "grey", children }: { tone?: keyof typeof tones; children: ReactNode }) => (
  <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
);

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="border-b border-line bg-surface-2 text-start text-xs uppercase tracking-wide text-muted"><tr>{head.map((h) => <th key={h} className="px-4 py-3 text-start font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line [&_td]:px-4 [&_td]:py-3 [&_td]:align-middle">{children}</tbody>
      </table>
      {empty && <p className="px-4 py-10 text-center text-sm text-muted">{empty}</p>}
    </div>
  );
}

export function Pager({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-5 flex items-center justify-center gap-3 text-sm">
      {page > 1 ? <Link href={href(page - 1)} className={btnGhost}>← Prev</Link> : <span />}
      <span className="text-muted">Page {page} of {pages}</span>
      {page < pages ? <Link href={href(page + 1)} className={btnGhost}>Next →</Link> : <span />}
    </nav>
  );
}

export const Stat = ({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: "red" }) => (
  <div className="rounded-2xl border border-line bg-surface p-5">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
    <p className={`mt-2 font-display text-3xl font-bold ${tone === "red" ? "text-danger" : ""}`}>{value}</p>
    {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
  </div>
);

export const inputCls = "w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none transition focus:border-brand aria-[invalid=true]:border-danger";
export const aed = (n: number) => new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", minimumFractionDigits: n % 1 ? 2 : 0 }).format(n);
export const dubaiDate = (d: Date | string, time = false) => new Intl.DateTimeFormat("en-AE", { dateStyle: "medium", ...(time ? { timeStyle: "short" } : {}), timeZone: "Asia/Dubai" }).format(new Date(d));
