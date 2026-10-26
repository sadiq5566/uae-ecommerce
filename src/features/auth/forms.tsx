"use client";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/i18n";
import { Field, FormAlert, PasswordField, SubmitButton } from "@/components/form-ui";
import { forgotPasswordAction, loginAction, registerAction, resendOtpAction, resetPasswordAction, verifyEmailAction } from "./actions";
import type { FormState } from "./schemas";

const init: FormState = {};
type P = { locale: Locale; t: Dictionary; next?: string };

export function LoginForm({ locale, t, next }: P) {
  const [s, action, pending] = useActionState(loginAction, init);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} /><input type="hidden" name="next" value={next ?? ""} />
      <FormAlert error={s.error} errors={t.errors} />
      <Field id="email" name="email" type="email" autoComplete="email" required defaultValue={s.values?.email} label={t.auth.email} errors={t.errors} error={s.fieldErrors?.email} />
      <PasswordField id="password" name="password" autoComplete="current-password" required label={t.auth.password} errors={t.errors} show={t.auth.show} hide={t.auth.hide} />
      <Link href={`/${locale}/forgot-password`} className="text-sm text-brand hover:underline">{t.auth.forgot}</Link>
      <SubmitButton pending={pending}>{t.auth.signIn}</SubmitButton>
    </form>
  );
}

export function RegisterForm({ locale, t, next }: P) {
  const [s, action, pending] = useActionState(registerAction, init);
  const e = s.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} /><input type="hidden" name="next" value={next ?? ""} />
      <FormAlert error={s.error} errors={t.errors} />
      <Field id="name" name="name" autoComplete="name" required defaultValue={s.values?.name} label={t.auth.name} errors={t.errors} error={e.name} />
      <Field id="email" name="email" type="email" autoComplete="email" required defaultValue={s.values?.email} label={t.auth.email} errors={t.errors} error={e.email} />
      <PasswordField id="password" name="password" autoComplete="new-password" required minLength={10} label={t.auth.password} hint={t.auth.passwordHint} errors={t.errors} error={e.password} show={t.auth.show} hide={t.auth.hide} />
      <SubmitButton pending={pending}>{t.auth.signUp}</SubmitButton>
    </form>
  );
}

export function ForgotForm({ locale, t }: P) {
  const [s, action, pending] = useActionState(forgotPasswordAction, init);
  if (s.ok) return <p role="status" className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">{t.auth.forgotDone}</p>;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <FormAlert error={s.error} errors={t.errors} />
      <Field id="email" name="email" type="email" autoComplete="email" required defaultValue={s.values?.email} label={t.auth.email} errors={t.errors} error={s.fieldErrors?.email} />
      <SubmitButton pending={pending}>{t.auth.sendLink}</SubmitButton>
    </form>
  );
}

export function ResetForm({ locale, t, token }: P & { token: string }) {
  const [s, action, pending] = useActionState(resetPasswordAction, init);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} /><input type="hidden" name="token" value={token} />
      <FormAlert error={s.error ?? (s.fieldErrors?.token ? "reset_invalid" : undefined)} errors={t.errors} />
      <PasswordField id="password" name="password" autoComplete="new-password" required minLength={10} label={t.auth.password} hint={t.auth.passwordHint} errors={t.errors} error={s.fieldErrors?.password} show={t.auth.show} hide={t.auth.hide} />
      <SubmitButton pending={pending}>{t.auth.resetBtn}</SubmitButton>
    </form>
  );
}

/** Step 2 of sign-up (and of first sign-in for older accounts): the 6-digit code that was emailed. */
export function VerifyForm({ locale, t, email, purpose, next }: P & { email: string; purpose: "register" | "verify" }) {
  const [s, action, pending] = useActionState(verifyEmailAction, init);
  const [r, resend, resending] = useActionState(resendOtpAction, init);
  const [wait, setWait] = useState(45); // a code was just sent when this page opened
  useEffect(() => { if (wait <= 0) return; const id = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(id); }, [wait]);
  const hidden = <><input type="hidden" name="locale" value={locale} /><input type="hidden" name="email" value={email} /><input type="hidden" name="purpose" value={purpose} /></>;
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4" noValidate>
        {hidden}<input type="hidden" name="next" value={next ?? ""} />
        <FormAlert error={s.error} errors={t.errors} />
        <div>
          <label htmlFor="code" className="mb-1.5 block text-sm font-medium">{t.auth.otpLabel}</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus dir="ltr" aria-invalid={!!s.error}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] outline-none transition focus:border-brand focus:shadow-card aria-[invalid=true]:border-danger" placeholder="······" />
        </div>
        <SubmitButton pending={pending}>{purpose === "register" ? t.auth.otpCreate : t.auth.otpVerify}</SubmitButton>
      </form>
      <form action={resend} onSubmit={() => setWait(45)} className="text-center text-sm text-muted">
        {hidden}
        {r.ok && <p role="status" className="mb-2 text-brand">✓ {t.auth.otpResent}</p>}
        {r.error && <p role="alert" className="mb-2 text-danger">{(t.errors as Record<string, string>)[r.error] ?? t.errors.generic}</p>}
        <button disabled={wait > 0 || resending} className="font-semibold text-brand hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline">
          {wait > 0 ? `${t.auth.otpResend} (${wait})` : t.auth.otpResend}
        </button>
      </form>
    </div>
  );
}
