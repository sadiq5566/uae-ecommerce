"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** A dropdown that sets one URL parameter (e.g. products per page) and goes back to page 1. The default value is left out of the URL. */
export function ParamSelect({ param, value, defaultValue, options, label, className = "" }: { param: string; value: string; defaultValue: string; options: { value: string; label: string }[]; label: string; className?: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <select aria-label={label} value={value} onChange={(e) => {
      const p = new URLSearchParams(params.toString());
      p.delete("page");
      if (e.target.value === defaultValue) p.delete(param); else p.set(param, e.target.value);
      const s = p.toString();
      router.push(s ? `${path}?${s}` : path, { scroll: false });
    }} className={`rounded-full border border-line bg-surface px-4 py-2 text-sm outline-none focus:border-brand ${className}`}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
