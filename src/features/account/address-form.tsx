"use client";
import { useActionState, useEffect, useRef } from "react";
import type { Dictionary } from "@/lib/dictionaries";
import { Field, FormAlert, inputCls, SubmitButton } from "@/components/form-ui";
import { EMIRATES, type FormState } from "@/features/auth/schemas";
import { saveAddressAction } from "./actions";
import type { AddressView } from "./service";

export function AddressForm({ t, address, onDone }: { t: Dictionary; address?: AddressView; onDone?: () => void }) {
  const [s, action, pending] = useActionState<FormState, FormData>(saveAddressAction, {});
  const done = useRef(onDone);
  useEffect(() => { if (s.ok) done.current?.(); }, [s.ok]);
  const e = s.fieldErrors ?? {};
  const a = address;
  const v = (k: keyof AddressView) => s.values?.[k] ?? (a?.[k] as string | undefined);
  const er: Record<string, string> = t.errors;
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      {a && <input type="hidden" name="id" value={a.id} />}
      <div className="sm:col-span-2"><FormAlert error={s.error} errors={er} /></div>
      <Field id={`label-${a?.id ?? "new"}`} name="label" label={t.address.label} defaultValue={v("label")} errors={er} error={e.label} />
      <Field id={`rn-${a?.id ?? "new"}`} name="recipientName" label={t.address.recipient} defaultValue={v("recipientName")} required autoComplete="name" errors={er} error={e.recipientName} />
      <Field id={`ph-${a?.id ?? "new"}`} name="phone" type="tel" label={t.address.phone} defaultValue={v("phone")} placeholder="050 123 4567" required autoComplete="tel" errors={er} error={e.phone} />
      <div>
        <label htmlFor={`em-${a?.id ?? "new"}`} className="mb-1.5 block text-sm font-medium">{t.address.emirate}</label>
        <select key={v("emirate")} id={`em-${a?.id ?? "new"}`} name="emirate" defaultValue={v("emirate") ?? ""} required aria-invalid={!!e.emirate} className={inputCls}>
          <option value="" disabled>{t.address.select}</option>
          {EMIRATES.map((x) => <option key={x} value={x}>{t.address.emirates[x]}</option>)}
        </select>
        {e.emirate && <p role="alert" className="mt-1.5 text-sm text-danger">{er[e.emirate] ?? er.generic}</p>}
      </div>
      <Field id={`ar-${a?.id ?? "new"}`} name="area" label={t.address.area} defaultValue={v("area")} required errors={er} error={e.area} />
      <Field id={`st-${a?.id ?? "new"}`} name="street" label={t.address.street} defaultValue={v("street")} errors={er} error={e.street} />
      <Field id={`bd-${a?.id ?? "new"}`} name="building" label={t.address.building} defaultValue={v("building")} required errors={er} error={e.building} />
      <Field id={`un-${a?.id ?? "new"}`} name="unit" label={t.address.unit} defaultValue={v("unit")} errors={er} error={e.unit} />
      <Field id={`lm-${a?.id ?? "new"}`} name="landmark" label={t.address.landmark} defaultValue={v("landmark")} errors={er} error={e.landmark} className="sm:col-span-2" />
      <div className="sm:col-span-2">
        <label htmlFor={`in-${a?.id ?? "new"}`} className="mb-1.5 block text-sm font-medium">{t.address.instructions}</label>
        <textarea id={`in-${a?.id ?? "new"}`} name="instructions" rows={2} maxLength={300} defaultValue={v("instructions")} className={inputCls} />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="isDefault" defaultChecked={a?.isDefault} className="size-4 accent-[var(--brand)]" />{t.address.makeDefault}</label>
      <div className="flex gap-2 sm:col-span-2">
        <div className="w-44"><SubmitButton pending={pending}>{t.account.save}</SubmitButton></div>
        {onDone && <button type="button" onClick={onDone} className="rounded-xl border border-line px-5 py-3 text-sm font-medium hover:bg-surface-2">{t.address.cancel}</button>}
      </div>
    </form>
  );
}
