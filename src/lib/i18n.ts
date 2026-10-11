export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export const isLocale = (v: string): v is Locale => (locales as readonly string[]).includes(v);
export const dirOf = (l: Locale) => (l === "ar" ? "rtl" : "ltr");

const intlLocale: Record<Locale, string> = { en: "en-AE", ar: "ar-AE" };

export function formatAED(amount: number, locale: Locale) {
  return new Intl.NumberFormat(intlLocale[locale], {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: amount % 1 ? 2 : 0,
  }).format(amount);
}

export const formatNumber = (n: number, locale: Locale) =>
  new Intl.NumberFormat(intlLocale[locale]).format(n);
