import type { ReactNode } from "react";

export function AuthShell({ title, sub, children, footer }: { title: string; sub?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative isolate mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 py-14">
      <div aria-hidden className="animate-blob absolute -top-10 start-0 -z-10 size-64 bg-brand/15 blur-3xl" />
      <div className="animate-fade-up w-full rounded-3xl border border-line bg-surface p-7 shadow-card sm:p-9">
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
      </div>
    </div>
  );
}
