"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";

/** Switches language on the same page, keeping the query string (filters, search) and hash. */
export function LangSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const path = usePathname() || "/";
  const router = useRouter();
  const target: Locale = locale === "en" ? "ar" : "en";
  const base = path.replace(/^\/(en|ar)(?=\/|$)/, `/${target}`);
  return (
    <Link
      href={base} hrefLang={target} lang={target} prefetch={false}
      onClick={(e) => {
        // Read the live query/hash at click time so this stays a static, cacheable component.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        document.cookie = `locale=${target}; path=/; max-age=31536000; samesite=lax`;
        router.push(`${base}${location.search}${location.hash}`);
      }}
      className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-semibold transition hover:border-brand hover:text-brand"
    >{label}</Link>
  );
}
