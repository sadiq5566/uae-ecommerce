import type { Metadata } from "next";
import { locales, type Locale } from "@/lib/i18n";

/** hreflang regions: both languages target the UAE market. */
export const HREFLANG: Record<Locale, string> = { en: "en-AE", ar: "ar-AE" };

/** Canonical + hreflang alternates for a locale-less path like "/c/audio". */
export function alternatesFor(locale: Locale, path: string): Metadata["alternates"] {
  return {
    canonical: `/${locale}${path}`,
    languages: { ...Object.fromEntries(locales.map((l) => [HREFLANG[l], `/${l}${path}`])), "x-default": `/en${path}` },
  };
}

/** Filtered/sorted/paginated URL variants are crawlable duplicates: keep them out of the index. */
export const noIndexIf = (cond: boolean): Metadata["robots"] => (cond ? { index: false, follow: true } : undefined);

/** UAE geo hints for search engines (Google mostly relies on hreflang + content, Bing reads these). */
export const GEO_META = { "geo.region": "AE", "geo.placename": "United Arab Emirates", "content-language": "en-AE, ar-AE" };

/** Site-wide Organization + WebSite structured data (brand knowledge panel, sitelinks search box, UAE service area). */
export function siteJsonLd(o: { base: string; name: string; lang: Locale; logo?: string; email?: string; whatsapp?: string }) {
  const phone = o.whatsapp ? `+${o.whatsapp.replace(/\D/g, "")}` : undefined;
  return [
    {
      "@context": "https://schema.org", "@type": "OnlineStore", "@id": `${o.base}/#org`, name: o.name, url: o.base,
      ...(o.logo && { logo: o.logo, image: o.logo }),
      ...(o.email && { email: o.email }),
      ...(phone && { telephone: phone }),
      areaServed: { "@type": "Country", name: "United Arab Emirates" },
      address: { "@type": "PostalAddress", addressCountry: "AE" },
      currenciesAccepted: "AED", paymentAccepted: "Cash on delivery, Credit card, Debit card",
      ...(phone && { contactPoint: { "@type": "ContactPoint", contactType: "customer service", telephone: phone, areaServed: "AE", availableLanguage: ["English", "Arabic"] } }),
    },
    {
      "@context": "https://schema.org", "@type": "WebSite", "@id": `${o.base}/#website`, url: o.base, name: o.name, inLanguage: HREFLANG[o.lang], publisher: { "@id": `${o.base}/#org` },
      potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${o.base}/${o.lang}/search?q={search_term_string}` }, "query-input": "required name=search_term_string" },
    },
  ];
}

/** UAE-targeted title/description wording shared by product, category and home pages. */
const TAIL = {
  en: "Fast delivery across the UAE (Dubai, Abu Dhabi, Sharjah), cash on delivery, easy returns.",
  ar: "توصيل سريع في الإمارات (دبي، أبوظبي، الشارقة)، الدفع عند الاستلام وإرجاع سهل.",
};
export const uaeTitle = (lang: Locale, name: string) => (lang === "ar" ? `${name} – اشتري أونلاين في الإمارات` : `${name} – Buy Online in UAE`);
export const categoryTitle = (lang: Locale, name: string) => (lang === "ar" ? `تسوق ${name} أونلاين في الإمارات | دبي أبوظبي الشارقة` : `Buy ${name} Online in UAE | Dubai, Abu Dhabi & Sharjah`);
/** Keeps a real description first and tops it up with the UAE delivery line so short copy is still a full snippet (~155 chars). */
export function uaeDescription(lang: Locale, text?: string) {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.length >= 120) return t.slice(0, 158);
  return `${t ? `${t.replace(/[.\s]+$/, "")}. ` : ""}${TAIL[lang]}`.slice(0, 158);
}
export const homeTitle = (lang: Locale, name: string) => (lang === "ar" ? `${name} | تسوق المجوهرات والعطور والساعات والحقائب أونلاين في الإمارات` : `${name} | Jewelry, Perfume, Watches & Bags Online in UAE`);
export const homeDescription = (lang: Locale) => (lang === "ar"
  ? "تسوق المجوهرات والعطور والساعات والحقائب والنظارات أونلاين في الإمارات. توصيل سريع إلى دبي وأبوظبي والشارقة، الدفع عند الاستلام وإرجاع سهل."
  : "Shop jewelry, perfume, watches, bags & sunglasses online in the UAE. Fast delivery to Dubai, Abu Dhabi & Sharjah, cash on delivery, easy returns.");
