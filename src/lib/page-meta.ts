import type { Metadata } from "next";
import { getDictionary, type Dictionary } from "./dictionaries";
import { isLocale } from "./i18n";

/** Localised <title> for private pages (account, cart, checkout…), always noindex. */
export function privatePage(title: (t: Dictionary) => string, extra: Metadata = {}) {
  return async ({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> => {
    const { lang } = await params;
    if (!isLocale(lang)) return {};
    return { title: title(await getDictionary(lang)), robots: { index: false, follow: false }, ...extra };
  };
}
