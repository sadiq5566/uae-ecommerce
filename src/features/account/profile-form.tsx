"use client";
import { useActionState } from "react";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/i18n";
import { Field, FormAlert, PasswordField, inputCls, SubmitButton } from "@/components/form-ui";
import type { FormState } from "@/features/auth/schemas";
import { changePasswordAction, updateProfileAction } from "./actions";

export function ProfileForm({ t, user }: { t: Dictionary; user: { name: string; email: string; phone?: string; locale: Locale } }) {
  const [s, action, pending] = useActionState<FormState, FormData>(updateProfileAction, {});
  return (
    <form action={action} className="grid max-w-xl gap-4" noValidate>
      <FormAlert error={s.error} errors={t.errors} />
      {s.ok && <p role="status" className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">✓ {t.account.saved}</p>}
      <Field id="email" label={t.auth.email} value={user.email} readOnly disabled errors={t.errors} />
      <Field id="name" name="name" label={t.auth.name} defaultValue={s.values?.name ?? user.name} required autoComplete="name" errors={t.errors} error={s.fieldErrors?.name} />
      <Field id="phone" name="phone" type="tel" label={t.account.phone} defaultValue={s.values?.phone ?? user.phone} placeholder="+971 50 123 4567" autoComplete="tel" errors={t.errors} error={s.fieldErrors?.phone} />
      <div>
        <label htmlFor="locale" className="mb-1.5 block text-sm font-medium">{t.account.language}</label>
        <select key={s.values?.locale} id="locale" name="locale" defaultValue={s.values?.locale ?? user.locale} className={inputCls}><option value="en">English</option><option value="ar">العربية</option></select>
      </div>
      <div className="max-w-48"><SubmitButton pending={pending}>{t.account.save}</SubmitButton></div>
    </form>
  );
}

export function PasswordForm({ t }: { t: Dictionary }) {
  const [s, action, pending] = useActionState<FormState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="grid max-w-xl gap-4" noValidate>
      <FormAlert error={s.error} errors={t.errors} />
      {s.ok && <p role="status" className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">✓ {t.account.passwordChanged}</p>}
      <PasswordField id="cur-pw" name="current" autoComplete="current-password" required label={t.account.currentPassword} errors={t.errors} error={s.fieldErrors?.current} show={t.auth.show} hide={t.auth.hide} />
      <PasswordField id="new-pw" name="password" autoComplete="new-password" required minLength={10} label={t.account.newPassword} hint={t.auth.passwordHint} errors={t.errors} error={s.fieldErrors?.password} show={t.auth.show} hide={t.auth.hide} />
      <div className="max-w-56"><SubmitButton pending={pending}>{t.account.changePassword}</SubmitButton></div>
    </form>
  );
}
