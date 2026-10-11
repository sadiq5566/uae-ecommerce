"use client";
import { useState } from "react";
import { useToast } from "./toast";

// Light client-side check only (no Zod in the browser bundle); real validation happens where the address is stored.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function NewsletterForm({ t }: { t: { email: string; subscribe: string; invalid: string; thanks: string } }) {
  const [error, setError] = useState(false);
  const toast = useToast();
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const ok = EMAIL.test(String(new FormData(form).get("email") ?? "").trim());
        setError(!ok);
        if (ok) { toast(t.thanks); form.reset(); }
      }}
      className="flex w-full max-w-md flex-col gap-2"
    >
      <div className="flex gap-2">
        <input
          name="email" type="email" autoComplete="email" placeholder={t.email} aria-label={t.email}
          aria-invalid={error} aria-describedby={error ? "nl-err" : undefined}
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-brand"
        />
        <button className="rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-gold-fg transition hover:brightness-110 active:scale-95">{t.subscribe}</button>
      </div>
      {error && <p id="nl-err" role="alert" className="text-sm text-danger">{t.invalid}</p>}
    </form>
  );
}
