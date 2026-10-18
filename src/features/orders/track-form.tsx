"use client";
import { useActionState } from "react";
import { Field, SubmitButton } from "@/components/form-ui";
import type { Dictionary } from "@/lib/dictionaries";
import { trackOrderAction, type TrackState } from "./track-actions";

export function TrackForm({ locale, t, defaultNumber }: { locale: string; t: Dictionary; defaultNumber?: string }) {
  const [s, action, pending] = useActionState<TrackState, FormData>(trackOrderAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {s.error && <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{t.track[s.error]}</p>}
      <Field id="tr-no" name="orderNumber" label={t.track.orderNumber} placeholder="UAE-XXXXXXXX" defaultValue={s.number ?? defaultNumber} errors={t.errors} autoCapitalize="characters" required dir="ltr" />
      <Field id="tr-ph" name="phone" type="tel" label={t.track.phone} placeholder="050 123 4567" defaultValue={s.phone} errors={t.errors} autoComplete="tel" required />
      <SubmitButton pending={pending}>{t.track.submit}</SubmitButton>
    </form>
  );
}
