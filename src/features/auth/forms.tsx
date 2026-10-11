"use client";
import Link from "next/link";
import { useActionState } from "react";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/i18n";
import { Field, FormAlert, PasswordField, SubmitButton } from "@/components/form-ui";
import { forgotPasswordAction, loginAction, registerAction, resetPasswordAction } from "./actions";
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
