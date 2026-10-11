"use client";
import { useState, type InputHTMLAttributes } from "react";

export const inputCls = "w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none transition focus:border-brand focus:shadow-card aria-[invalid=true]:border-danger";

export function Field({ id, label, error, errors, hint, className = "", ...rest }: {
  id: string; label: string; error?: string; errors: Record<string, string>; hint?: string; className?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const msg = error ? errors[error] ?? errors.generic : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      <input id={id} aria-invalid={!!msg} aria-describedby={msg ? `${id}-err` : hint ? `${id}-hint` : undefined} className={inputCls} {...rest} />
      {msg ? <p id={`${id}-err`} role="alert" className="mt-1.5 text-sm text-danger">{msg}</p> : hint ? <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function PasswordField({ show, hide, ...p }: { show: string; hide: string } & Parameters<typeof Field>[0]) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Field {...p} type={visible ? "text" : "password"} />
      <button type="button" onClick={() => setVisible((v) => !v)} aria-pressed={visible} className="absolute end-1 top-[2.2rem] min-h-8 rounded-lg px-3 text-xs font-medium text-muted hover:text-brand">{visible ? hide : show}</button>
    </div>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button disabled={pending} className="w-full rounded-xl bg-brand px-5 py-3 font-semibold text-brand-fg transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60">
      {pending ? <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent align-middle" aria-hidden /> : children}
    </button>
  );
}

export function FormAlert({ error, errors }: { error?: string; errors: Record<string, string> }) {
  if (!error) return null;
  return <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{errors[error] ?? errors.generic}</p>;
}
