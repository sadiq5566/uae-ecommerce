"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function SortSelect({ value, options, label }: { value: string; options: Record<string, string>; label: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="hidden text-muted sm:inline">{label}</span>
      <select aria-label={label} value={value} onChange={(e) => {
        const p = new URLSearchParams(params.toString());
        p.delete("page");
        if (e.target.value === "relevance") p.delete("sort"); else p.set("sort", e.target.value);
        const s = p.toString();
        router.push(s ? `${path}?${s}` : path);
      }} className="rounded-full border border-line bg-surface px-4 py-2 text-sm outline-none focus:border-brand">
        {Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </label>
  );
}
