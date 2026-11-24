import { buildProductFaqs, dedupeFaqs, localizeFaqs, storeFaqs, storeProductFaqs, type Faq, type FaqItem, type Lang } from "../../../lib/faq";
import type { ProductDetail } from "./service";

type Offers = { cod: boolean; returnDays: number; freeDelivery: { enabled: boolean; all?: boolean; min: number } };

export const FAQ_TITLE = {
  home: { en: "Frequently asked questions", ar: "الأسئلة الشائعة" },
  category: { en: "Frequently asked questions", ar: "أسئلة شائعة" },
  product: (name: string, lang: Lang) => (lang === "ar" ? `أسئلة شائعة عن ${name}` : `Questions about ${name}`),
};

/**
 * Everything the product page asks and answers: the questions stored on the (shared) product, or, until `npm run db:seo-faq` has run, the same
 * questions built on the fly from its data, followed by this store's live price / delivery / cash-on-delivery / returns answers.
 */
export function productPageFaqs(p: ProductDetail, lang: Lang, store: { en: string; ar?: string }, offers: Offers): Faq[] {
  const stored = p.faqs?.length ? p.faqs : buildProductFaqs({
    name: p.name.en, nameAr: p.nameAr, brand: p.brand, category: p.category, subcategory: p.subcategory, model: p.model, finish: p.finish,
    highlights: p.highlights, includedItems: p.includedItems, variants: p.variants,
  });
  const live = storeProductFaqs({ name: p.name.en, nameAr: p.nameAr, store: store.en, storeAr: store.ar, price: p.finalPrice, inStock: p.stock > 0, offers })[lang];
  return dedupeFaqs([...localizeFaqs(stored, lang), ...live]);
}

/** Home page: the admin's own questions when written, otherwise the built-in questions about the store. */
/** `sells` = the store's own category names ({ en: ["Watches", "Perfume"], ar: ["ساعات", "عطور"] }). */
export function homePageFaqs(items: FaqItem[], lang: Lang, store: { en: string; ar?: string }, offers: Offers, sells?: { en: string[]; ar: string[] }): Faq[] {
  const own = localizeFaqs(items, lang);
  return own.length ? own : storeFaqs({ store: store.en, storeAr: store.ar, cod: offers.cod, returnDays: offers.returnDays, ...sellsText(sells) })[lang];
}

/** Category page: stored category questions, the buying guide's questions, and (when there is no guide) this store's delivery / cash-on-delivery / returns answers for the category. */
export function categoryPageFaqs(o: { stored?: FaqItem[]; guide?: { q: { en: string; ar: string }; a: { en: string; ar: string } }[]; category: { en: string; ar: string }; lang: Lang; store: { en: string; ar?: string }; offers: Offers }): Faq[] {
  const { lang } = o, c = o.category[lang] || o.category.en, s = lang === "ar" ? o.store.ar || o.store.en : o.store.en;
  const own = localizeFaqs(o.stored, lang), guide = (o.guide ?? []).map((f) => ({ q: f.q[lang], a: f.a[lang] }));
  const live: Faq[] = lang === "ar"
    ? [
      { q: `هل يمكنني شراء ${c} أونلاين في دبي؟`, a: `نعم. يوصل ${s} ${c} إلى دبي وأبوظبي والشارقة وجميع الإمارات السبع${o.offers.cod ? "، والدفع عند الاستلام متاح" : ""}.` },
      ...(o.offers.returnDays > 0 ? [{ q: `هل يمكن إرجاع ${c}؟`, a: `نعم. يمكنك طلب الإرجاع خلال ${o.offers.returnDays} أيام من التسليم، والشروط في صفحة الإرجاع.` }] : []),
    ]
    : [
      { q: `Can I buy ${c} online in Dubai?`, a: `Yes. ${s} delivers ${c} to Dubai, Abu Dhabi, Sharjah and all seven emirates${o.offers.cod ? ", and cash on delivery is available" : ""}.` },
      ...(o.offers.returnDays > 0 ? [{ q: `Can I return ${c}?`, a: `Yes. You can request a return within ${o.offers.returnDays} days of delivery. The conditions are on our Returns page.` }] : []),
    ];
  return dedupeFaqs([...own, ...guide, ...(guide.length ? [] : live)]);
}

/** "watches, perfume and bags" / "ساعات وعطور وحقائب" from category names. */
export function sellsText(sells?: { en: string[]; ar: string[] }): { sells?: string; sellsAr?: string } {
  const join = (xs: string[], and: string) => { const l = xs.map((x) => x.trim()).filter(Boolean).slice(0, 8); return l.length < 2 ? l.join("") : `${l.slice(0, -1).join(and === " and " ? ", " : "، ")}${and}${l[l.length - 1]}`; };
  const en = join((sells?.en ?? []).map((x) => x.toLowerCase()), " and "), ar = join(sells?.ar ?? [], " و");
  return { ...(en && { sells: en }), ...(ar && { sellsAr: ar }) };
}
