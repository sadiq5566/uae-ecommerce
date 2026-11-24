// FAQ content for products, categories and the home page. Pure: no DB, no Next, so the storefront, the importer and scripts/seo-faq.ts share it.
//
// Two kinds of FAQ, deliberately kept apart because the catalogue is SHARED by every store while delivery/returns/prices are per store:
//   1. STORED (Product.faqs / Collection.faqs / Homepage.faqs): questions about the PRODUCT or CATEGORY itself (what it is, colours, sizes, what is
//      in the box, how to choose, care). Written by `npm run db:seo-faq` or by an admin; the same text serves every storefront on the shared DB.
//   2. LIVE (storeProductFaqs): price, delivery to Dubai / Abu Dhabi / Sharjah, cash on delivery, returns. Built at render time from this store's
//      own settings, so they can never go stale and never name another store.
// Only facts the data holds are stated. No materials, authenticity, warranty, discounts or stock promises are invented.
import { STORE_NAME, kindOf, plainName, resolveBrand } from "./seo-copy";

export type FaqItem = { q: string; a: string; qAr?: string; aAr?: string; auto?: boolean };
export type Faq = { q: string; a: string };
export type Lang = "en" | "ar";

/** Stored items -> one language. Arabic falls back to English when no Arabic text was written. Blank rows are dropped. */
export function localizeFaqs(items: FaqItem[] | undefined | null, lang: Lang): Faq[] {
  return (items ?? [])
    .map((f) => (lang === "ar" ? { q: f.qAr?.trim() || f.q?.trim(), a: f.aAr?.trim() || f.a?.trim() } : { q: f.q?.trim(), a: f.a?.trim() }))
    .filter((f): f is Faq => !!f.q && !!f.a);
}

/** Same question never twice on a page (stored + live + category guide can overlap). Keeps the first. */
export function dedupeFaqs(list: Faq[]): Faq[] {
  const seen = new Set<string>();
  // Unicode-aware on purpose: /\W/ would erase Arabic letters and merge every Arabic question into one.
  return list.filter((f) => { const k = f.q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""); if (seen.has(k)) return false; seen.add(k); return true; });
}

/** schema.org FAQPage. Google shows FAQ rich results only for a few site types now, but the same markup is what AI answer engines read. */
export function faqPageJsonLd(faqs: Faq[], lang: Lang, url?: string) {
  return {
    "@context": "https://schema.org", "@type": "FAQPage", ...(url && { "@id": `${url}#faq`, url }), inLanguage: lang === "ar" ? "ar-AE" : "en-AE",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

const AR_NOUN: Record<string, string> = { watches: "ساعة", jewelry: "قطعة مجوهرات", perfume: "عطر", bags: "حقيبة", footwear: "حذاء", glasses: "نظارة", caps: "قبعة", belts: "حزام", apparel: "قطعة ملابس", home: "منتج للمنزل", accessories: "إكسسوار" };
const joinList = (xs: string[], lang: Lang, max = 8) => {
  const l = xs.slice(0, max);
  if (l.length < 2) return l.join("");
  const and = lang === "ar" ? " و" : " and ";
  return lang === "ar" ? l.slice(0, -1).join("، ") + and + l[l.length - 1] : l.slice(0, -1).join(", ") + and + l[l.length - 1];
};
const uniq = (xs: (string | undefined | null)[]) => [...new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))];

export type ProductFaqInput = {
  name: string; nameAr?: string; brand?: string | null; category: string; subcategory?: string | null; model?: string | null; finish?: string | null;
  highlights?: string[]; includedItems?: string[]; variants?: { color?: string | null; size?: string | null }[];
};

/**
 * Product-only questions, English + Arabic, from the product's own data. Each answer is a short, self-contained sentence or two (what answer
 * engines quote). A question is only produced when the data can answer it truthfully, so a bare product gets 2-3 and a rich one 5-6.
 */
export function buildProductFaqs(p: ProductFaqInput): FaqItem[] {
  const name = plainName(p.name), nameAr = (p.nameAr ?? "").trim() || name;
  const resolved = resolveBrand(p.brand, p.name), kind = kindOf(p.category, name);
  // A product with no real brand resolves to THIS store's name; the catalogue is shared, so a store name must never be written into it.
  const brand = resolved === STORE_NAME ? "" : resolved;
  const modelText = p.model && !name.toLowerCase().includes(p.model.trim().toLowerCase()) && p.model.trim().toLowerCase() !== name.toLowerCase() ? p.model.trim() : "";
  const noun = kind.noun, nounAr = AR_NOUN[p.category] ?? "منتج";
  const colors = uniq((p.variants ?? []).map((v) => v.color)), allSizes = uniq((p.variants ?? []).map((v) => v.size));
  const sizes = allSizes.length <= 10 && allSizes.every((x) => x.length <= 30) ? allSizes : []; // messy supplier size strings are not worth quoting
  const hl = uniq(p.highlights ?? []).slice(0, 4), inc = uniq(p.includedItems ?? []);
  const out: FaqItem[] = [];
  const put = (q: string, a: string, qAr: string, aAr: string) => out.push({ q, a, qAr, aAr, auto: true });

  const known = [modelText && `model ${modelText}`, p.finish && `${p.finish} finish`].filter(Boolean) as string[];
  const knownAr = [modelText && `الموديل ${modelText}`, p.finish && `بتشطيب ${p.finish}`].filter(Boolean) as string[];
  put(
    `What is ${name}?`,
    `${name} is a ${noun}${brand && !name.toLowerCase().includes(brand.toLowerCase()) ? ` by ${brand}` : ""}${known.length ? ` (${known.join(", ")})` : ""}. ${hl.length ? `Key points: ${joinList(hl, "en")}.` : kind.lines[0]}`,
    `ما هو ${nameAr}؟`,
    `${nameAr} هو ${nounAr}${brand && !nameAr.includes(brand) ? ` من ${brand}` : ""}${knownAr.length ? ` (${knownAr.join("، ")})` : ""}.${hl.length ? ` أبرز المميزات: ${joinList(hl, "ar")}.` : ""}`.trim(),
  );
  if (colors.length) put(
    `Which colours does ${name} come in?`, `${name} is available in ${joinList(colors, "en")}. Choose your colour on the product page before adding it to the cart.`,
    `ما الألوان المتوفرة لـ ${nameAr}؟`, `يتوفر ${nameAr} بالألوان: ${joinList(colors, "ar")}. اختر اللون من صفحة المنتج قبل الإضافة إلى السلة.`,
  );
  if (sizes.length) put(
    `Which sizes are available for ${name}?`, `${name} is listed in ${joinList(sizes, "en", 12)}. Pick your size on the product page; sizes that are out of stock cannot be selected.`,
    `ما المقاسات المتوفرة لـ ${nameAr}؟`, `يتوفر ${nameAr} بالمقاسات: ${joinList(sizes, "ar", 12)}. اختر المقاس من صفحة المنتج، والمقاسات غير المتوفرة لا يمكن اختيارها.`,
  );
  if (inc.length) put(
    `What is included with ${name}?`, `The listing includes: ${joinList(inc, "en")}.`,
    `ماذا يتضمن ${nameAr}؟`, `يشمل المنتج: ${joinList(inc, "ar")}.`,
  );
  put(
    `Is ${name} a good gift?`, `Yes, a ${noun} is a popular gift in the UAE for birthdays, Eid and anniversaries. If you are unsure of the choice, check the return policy first.`,
    `هل ${nameAr} مناسب كهدية؟`, `نعم، ${nounAr} من الهدايا المحبوبة في الإمارات في أعياد الميلاد والعيد والمناسبات. وإن لم تكن متأكداً من الاختيار فراجع سياسة الإرجاع أولاً.`,
  );
  return out;
}

export type StoreFaqInput = {
  name: string; nameAr?: string; store: string; storeAr?: string; price?: number; inStock: boolean;
  offers: { cod: boolean; returnDays: number; freeDelivery: { enabled: boolean; all?: boolean; min: number } };
};
const aed = (n: number, lang: Lang) => (lang === "ar" ? `${n.toLocaleString("en-US")} درهم` : `AED ${n.toLocaleString("en-US")}`);

/** This store's price, stock, delivery (Dubai first), cash on delivery and returns for ONE product, in both languages. Built live from settings. */
export function storeProductFaqs(i: StoreFaqInput): { en: Faq[]; ar: Faq[] } {
  const nameAr = i.nameAr || i.name, storeAr = i.storeAr || i.store, f = i.offers.freeDelivery;
  const en: Faq[] = [], ar: Faq[] = [];
  if (i.price && i.price > 0) {
    en.push({ q: `What is the price of ${i.name} in the UAE?`, a: `${i.name} costs ${aed(i.price, "en")} at ${i.store}, including delivery to Dubai, Abu Dhabi, Sharjah and the other emirates${f.enabled ? (f.all ? " (free delivery)" : f.min > 0 ? ` (free delivery over ${aed(f.min, "en")})` : "") : ""}. ${i.inStock ? "It is in stock now." : "It is currently out of stock."}` });
    ar.push({ q: `كم سعر ${nameAr} في الإمارات؟`, a: `سعر ${nameAr} ${aed(i.price, "ar")} لدى ${storeAr}${f.enabled ? (f.all ? " مع توصيل مجاني" : f.min > 0 ? ` مع توصيل مجاني للطلبات فوق ${aed(f.min, "ar")}` : "") : ""}. ${i.inStock ? "المنتج متوفر الآن." : "المنتج غير متوفر حالياً."}` });
  }
  en.push({ q: `Can I get ${i.name} delivered in Dubai?`, a: `Yes. ${i.store} delivers ${i.name} to Dubai, Abu Dhabi, Sharjah, Ajman and all seven emirates. Delivery times by emirate are on our Delivery page.` });
  ar.push({ q: `هل يمكن توصيل ${nameAr} إلى دبي؟`, a: `نعم. يوصل ${storeAr} ${nameAr} إلى دبي وأبوظبي والشارقة وعجمان وجميع الإمارات السبع. تجد مدة التوصيل لكل إمارة في صفحة التوصيل.` });
  if (i.offers.cod) {
    en.push({ q: `Can I pay cash on delivery for ${i.name}?`, a: `Yes, cash on delivery is available in the UAE. You pay the courier when your order arrives.` });
    ar.push({ q: `هل يمكن الدفع عند الاستلام لـ ${nameAr}؟`, a: `نعم، الدفع عند الاستلام متاح في الإمارات. تدفع للمندوب عند وصول طلبك.` });
  }
  if (i.offers.returnDays > 0) {
    en.push({ q: `Can I return ${i.name}?`, a: `Yes. You can request a return within ${i.offers.returnDays} days of delivery. See our Returns page for the conditions.` });
    ar.push({ q: `هل يمكن إرجاع ${nameAr}؟`, a: `نعم. يمكنك طلب الإرجاع خلال ${i.offers.returnDays} أيام من التسليم. راجع صفحة الإرجاع للاطلاع على الشروط.` });
  }
  return { en, ar };
}

/** Questions about the website / store itself, for the home page (shown when an admin has not written their own). */
/** `sells` / `sellsAr` = what the store sells, e.g. "jewelry, perfume and watches" (built from its own categories, so the text is right for every store). */
export function storeFaqs(o: { store: string; storeAr?: string; cod: boolean; returnDays: number; sells?: string; sellsAr?: string }): { en: Faq[]; ar: Faq[] } {
  const s = o.store, sa = o.storeAr || o.store;
  const en: Faq[] = [
    { q: `What is ${s}?`, a: `${s} is an online store in the UAE${o.sells ? ` for ${o.sells}` : ""}, with delivery to Dubai, Abu Dhabi, Sharjah and every emirate.` },
    { q: `Do you deliver to Dubai, Abu Dhabi and Sharjah?`, a: `Yes. ${s} delivers to all seven emirates. Delivery times for each emirate are on our Delivery page.` },
    ...(o.cod ? [{ q: `Can I pay cash on delivery?`, a: `Yes. Cash on delivery is available across the UAE, and you can also pay online by card.` }] : []),
    ...(o.returnDays > 0 ? [{ q: `What is your return policy?`, a: `You can request a return within ${o.returnDays} days of delivery. The conditions are on our Returns page.` }] : []),
    { q: `How do I track my order?`, a: `Use the Track order page with your order number, or message us on WhatsApp for an update.` },
    { q: `How can I contact ${s}?`, a: `Message us on WhatsApp or email us from the Contact page. We reply to customers in English and Arabic.` },
  ];
  const ar: Faq[] = [
    { q: `ما هو ${sa}؟`, a: `${sa} متجر إلكتروني في الإمارات${o.sellsAr ? ` لـ${o.sellsAr}` : ""}، مع توصيل إلى دبي وأبوظبي والشارقة وجميع الإمارات.` },
    { q: `هل توصلون إلى دبي وأبوظبي والشارقة؟`, a: `نعم. يوصل ${sa} إلى جميع الإمارات السبع. تجد مدة التوصيل لكل إمارة في صفحة التوصيل.` },
    ...(o.cod ? [{ q: `هل يمكن الدفع عند الاستلام؟`, a: `نعم. الدفع عند الاستلام متاح في جميع أنحاء الإمارات، كما يمكنك الدفع أونلاين بالبطاقة.` }] : []),
    ...(o.returnDays > 0 ? [{ q: `ما هي سياسة الإرجاع؟`, a: `يمكنك طلب الإرجاع خلال ${o.returnDays} أيام من التسليم. الشروط موجودة في صفحة الإرجاع.` }] : []),
    { q: `كيف أتتبع طلبي؟`, a: `استخدم صفحة تتبع الطلب برقم طلبك، أو راسلنا على واتساب لمعرفة آخر حالة.` },
    { q: `كيف أتواصل مع ${sa}؟`, a: `راسلنا على واتساب أو عبر البريد من صفحة التواصل. نرد على العملاء بالعربية والإنجليزية.` },
  ];
  return { en, ar };
}
