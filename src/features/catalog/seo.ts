import type { Metadata } from "next";
import { locales, type Locale } from "@/lib/i18n";

/** Canonical + hreflang alternates for a locale-less path like "/c/audio". */
export function alternatesFor(locale: Locale, path: string): Metadata["alternates"] {
  return {
    canonical: `/${locale}${path}`,
    languages: { ...Object.fromEntries(locales.map((l) => [l, `/${l}${path}`])), "x-default": `/en${path}` },
  };
}

/** Filtered/sorted/paginated URL variants are crawlable duplicates: keep them out of the index. */
export const noIndexIf = (cond: boolean): Metadata["robots"] => (cond ? { index: false, follow: true } : undefined);
