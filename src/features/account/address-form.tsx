"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/lib/dictionaries";
import { Field, FormAlert, inputCls, SubmitButton } from "@/components/form-ui";
import type { FormState } from "@/features/auth/schemas";
import { EMIRATES } from "@/lib/emirates";
import { saveAddressAction } from "./actions";
import { validateAddress, validateAddressField } from "./address-validate";
import type { AddressView } from "./service";

const Section = ({ title }: { title: string }) => <h3 className="border-b border-line pb-2 text-xs font-semibold uppercase tracking-widest text-muted sm:col-span-2">{title}</h3>;

export function AddressForm({ t, address, onDone }: { t: Dictionary; address?: AddressView; onDone?: () => void }) {
  const [s, action, pending] = useActionState<FormState, FormData>(saveAddressAction, {});
  const done = useRef(onDone);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (s.ok) done.current?.(); }, [s.ok]);
  // Problems found in the browser (shown as the shopper leaves a field) and fields edited since the server last complained.
  const [ce, setCe] = useState<Record<string, string>>({});
  const [edited, setEdited] = useState<Set<string>>(new Set());
  const a = address;
  const v = (k: keyof AddressView) => s.values?.[k] ?? (a?.[k] as string | undefined);
  const [instrLen, setInstrLen] = useState((v("instructions") ?? "").length);
  const er: Record<string, string> = t.errors;
  const e: Record<string, string> = { ...Object.fromEntries(Object.entries(s.fieldErrors ?? {}).filter(([k]) => !edited.has(k))), ...ce };
  const id = a?.id ?? "new";

  const check = (name: string, value: string) => setCe((p) => { const n = { ...p }; const m = validateAddressField(name, value); if (m) n[name] = m; else delete n[name]; return n; });
  const onBlur = (ev: React.FocusEvent<HTMLFormElement>) => { const el = ev.target as unknown as HTMLInputElement; if (el.name && el.name !== "id") check(el.name, el.value); };
  const onChange = (ev: React.ChangeEvent<HTMLFormElement>) => {
    const el = ev.target as unknown as HTMLInputElement; if (!el.name) return;
    setEdited((p) => new Set(p).add(el.name));
    if (el.name === "instructions") setInstrLen(el.value.length);
    if (ce[el.name] || el.tagName === "SELECT") check(el.name, el.value); // re-check as they fix it; a dropdown has no blur worth waiting for
  };
  const onSubmit = (ev: React.FormEvent<HTMLFormElement>) => {
    const values = Object.fromEntries([...new FormData(ev.currentTarget).entries()].filter(([, x]) => typeof x === "string")) as Record<string, string>;
    const errs = validateAddress(values);
    setEdited(new Set());
    if (!Object.keys(errs).length) { setCe({}); return; }
    ev.preventDefault(); // nothing is sent until the form is valid
    setCe(errs);
    const first = Object.keys(errs)[0];
    (ev.currentTarget.elements.namedItem(first) as HTMLElement | null)?.focus();
  };
  const hasErrors = Object.keys(e).length > 0;

  return (
    <form ref={formRef} action={action} onSubmit={onSubmit} onBlur={onBlur} onChange={onChange} className="grid gap-4 sm:grid-cols-2" noValidate>
      {a && <input type="hidden" name="id" value={a.id} />}
      <div className="sm:col-span-2"><FormAlert error={s.error ?? (hasErrors && !s.ok ? "fix_fields" : undefined)} errors={er} /></div>

      <Section title={t.address.contact} />
      <Field id={`rn-${id}`} name="recipientName" label={t.address.recipient} defaultValue={v("recipientName")} required autoComplete="name" maxLength={100} errors={er} error={e.recipientName} />
      <Field id={`ph-${id}`} name="phone" type="tel" inputMode="tel" label={t.address.phone} defaultValue={v("phone")} placeholder="050 123 4567" required autoComplete="tel" maxLength={20} dir="ltr" hint={t.address.phoneHint} errors={er} error={e.phone} />

      <Section title={t.address.location} />
      <div>
        <label htmlFor={`em-${id}`} className="mb-1.5 block text-sm font-medium">{t.address.emirate}</label>
        <select key={v("emirate")} id={`em-${id}`} name="emirate" defaultValue={v("emirate") ?? ""} required autoComplete="address-level1" aria-invalid={!!e.emirate} className={inputCls}>
          <option value="" disabled>{t.address.select}</option>
          {EMIRATES.map((x) => <option key={x} value={x}>{t.address.emirates[x]}</option>)}
        </select>
        {e.emirate && <p role="alert" className="mt-1.5 text-sm text-danger">{er[e.emirate] ?? er.generic}</p>}
      </div>
      <Field id={`ar-${id}`} name="area" label={t.address.area} defaultValue={v("area")} required maxLength={100} autoComplete="address-level2" hint={t.address.areaHint} errors={er} error={e.area} />
      <Field id={`bd-${id}`} name="building" label={t.address.building} defaultValue={v("building")} required maxLength={100} hint={t.address.buildingHint} errors={er} error={e.building} />
      <Field id={`un-${id}`} name="unit" label={`${t.address.unit} (${t.address.optional})`} defaultValue={v("unit")} maxLength={40} errors={er} error={e.unit} />
      <Field id={`st-${id}`} name="street" label={`${t.address.street} (${t.address.optional})`} defaultValue={v("street")} maxLength={150} autoComplete="address-line1" errors={er} error={e.street} className="sm:col-span-2" />

      <Section title={t.address.extra} />
      <Field id={`lb-${id}`} name="label" label={t.address.label} defaultValue={v("label")} maxLength={40} errors={er} error={e.label} />
      <Field id={`lm-${id}`} name="landmark" label={`${t.address.landmark} (${t.address.optional})`} defaultValue={v("landmark")} maxLength={150} errors={er} error={e.landmark} />
      <div className="sm:col-span-2">
        <label htmlFor={`in-${id}`} className="mb-1.5 block text-sm font-medium">{t.address.instructions} ({t.address.optional})</label>
        <textarea id={`in-${id}`} name="instructions" rows={2} maxLength={300} defaultValue={v("instructions")} aria-invalid={!!e.instructions} className={inputCls} />
        <p className="mt-1 text-end text-xs text-muted" dir="ltr">{instrLen}/300</p>
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="isDefault" defaultChecked={a?.isDefault} className="size-4 accent-[var(--brand)]" />{t.address.makeDefault}</label>
      <div className="flex gap-2 sm:col-span-2">
        <div className="w-44"><SubmitButton pending={pending}>{t.account.save}</SubmitButton></div>
        {onDone && <button type="button" onClick={onDone} className="rounded-xl border border-line px-5 py-3 text-sm font-medium hover:bg-surface-2">{t.address.cancel}</button>}
      </div>
    </form>
  );
}
