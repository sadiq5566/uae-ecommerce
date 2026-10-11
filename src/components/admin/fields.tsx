"use client";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Field } from "@/components/form-ui";
import { plain } from "@/lib/admin/common";
import { inputCls } from "./ui";

type FV = { values?: Record<string, string>; fieldErrors?: Record<string, string> };

/** Text input wired to a form state: re-fills submitted values after a validation error and shows messages. */
export function TF({ s, name, label, defaultValue, hint, className, ...rest }: { s: FV; name: string; label: string; defaultValue?: string | number | null; hint?: string; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "name">) {
  return <Field id={`f-${name}`} name={name} label={label} hint={hint} className={className} errors={plain} error={s.fieldErrors?.[name]} defaultValue={s.values?.[name] ?? (defaultValue ?? "")} {...rest} />;
}

export function TA({ s, name, label, defaultValue, rows = 4, className, error, ...rest }: { s: FV; name: string; label: string; defaultValue?: string | null; rows?: number; className?: string; error?: string } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "defaultValue" | "name">) {
  const e = error ?? s.fieldErrors?.[name];
  return (
    <div className={className}>
      <label htmlFor={`f-${name}`} className="mb-1.5 block text-sm font-medium">{label}</label>
      <textarea id={`f-${name}`} name={name} rows={rows} aria-invalid={!!e} className={inputCls} defaultValue={s.values?.[name] ?? defaultValue ?? ""} {...rest} />
      {e && <p role="alert" className="mt-1.5 text-sm text-danger">{e}</p>}
    </div>
  );
}

export function SF({ s, name, label, defaultValue, children, className, ...rest }: { s: FV; name: string; label: string; defaultValue?: string; children: ReactNode; className?: string } & Omit<SelectHTMLAttributes<HTMLSelectElement>, "defaultValue" | "name">) {
  const e = s.fieldErrors?.[name];
  const v = s.values?.[name] ?? defaultValue ?? "";
  return (
    <div className={className}>
      <label htmlFor={`f-${name}`} className="mb-1.5 block text-sm font-medium">{label}</label>
      {/* key forces the select to pick up restored values after React resets the form */}
      <select key={v} id={`f-${name}`} name={name} defaultValue={v} aria-invalid={!!e} className={inputCls} {...rest}>{children}</select>
      {e && <p role="alert" className="mt-1.5 text-sm text-danger">{e}</p>}
    </div>
  );
}

export function CB({ s, name, label, defaultChecked }: { s: FV; name: string; label: string; defaultChecked?: boolean }) {
  const restored = s.values ? s.values[name] === "on" : undefined;
  return <label className="flex cursor-pointer items-center gap-2 text-sm"><input key={String(restored ?? defaultChecked)} type="checkbox" name={name} defaultChecked={restored ?? defaultChecked} className="size-4 accent-[var(--brand)]" />{label}</label>;
}
