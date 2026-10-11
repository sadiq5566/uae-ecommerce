"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";

export function LangSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const path = usePathname() || "/";
  const target: Locale = locale === "en" ? "ar" : "en";
  const href = path.replace(/^\/(en|ar)(?=\/|$)/, `/${target}`);
  return (
    <Link
      href={href} hrefLang={target} lang={target} prefetch={false}
      onClick={() => { document.cookie = `locale=${target}; path=/; max-age=31536000; samesite=lax`; }}
      className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-semibold transition hover:border-brand hover:text-brand"
    >{label}</Link>
  );
}
