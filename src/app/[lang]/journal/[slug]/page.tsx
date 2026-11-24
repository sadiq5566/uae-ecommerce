import type { Metadata } from "next";
import Image from "@/components/img";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { fmt as fmtStr } from "@/lib/format";
import { RichText } from "@/components/rich-text";
import { Breadcrumbs } from "@/features/catalog/breadcrumbs";
import { keywordList } from "@/lib/seo-fields";
import { alternatesFor, HREFLANG } from "@/features/catalog/seo";
import { FaqSection } from "@/components/faq-section";
import { dedupeFaqs, localizeFaqs } from "../../../../../lib/faq";
import { absolute } from "@/lib/email";
import { getArticle } from "@/features/content/service";

export async function generateMetadata({ params }: PageProps<"/[lang]/journal/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLocale(lang)) return {};
  const a = await getArticle(slug);
  if (!a) return {};
  const desc = a.seo.description[lang] || a.excerpt[lang];
  const keywords = keywordList(a.seo.keywords[lang]);
  return { title: a.seo.title[lang] || a.title[lang], description: desc || undefined, keywords: keywords.length ? keywords : undefined, alternates: alternatesFor(lang, `/journal/${slug}`), openGraph: { title: a.title[lang], description: desc || undefined, type: "article", publishedTime: a.publishAt, modifiedTime: a.updatedAt, locale: lang === "ar" ? "ar_AE" : "en_AE", tags: keywords.length ? keywords : undefined, images: a.cover ? [a.cover] : undefined } };
}

export default async function ArticlePage({ params }: PageProps<"/[lang]/journal/[slug]">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const a = await getArticle(slug);
  if (!a) notFound();
  const t = await getDictionary(lang);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const date = new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-AE", { dateStyle: "long", timeZone: "Asia/Dubai" }).format(new Date(a.publishAt));
  // Article structured data mirrors visible content (headline, date, author, image).
  const url = `${base}/${lang}/journal/${a.slug}`, kw = keywordList(a.seo.keywords[lang]), desc = a.seo.description[lang] || a.excerpt[lang];
  const faqs = dedupeFaqs(localizeFaqs(a.faqs, lang));
  // A visible "Updated" date (only when it differs from the publish date by a day or more) matches dateModified in the structured data.
  const updated = a.updatedAt && new Date(a.updatedAt).getTime() - new Date(a.publishAt).getTime() > 864e5 ? new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-AE", { dateStyle: "long", timeZone: "Asia/Dubai" }).format(new Date(a.updatedAt)) : "";
  // Article structured data mirrors visible content. publisher points at the store's Organization (@id from the layout), dateModified lets answer engines prefer fresh content,
  // and the audience / coverage fields state the UAE market, which is what local and generative search match on.
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Article", "@id": `${url}#article`, headline: a.title[lang], ...(desc && { description: desc }), datePublished: a.publishAt, dateModified: a.updatedAt ?? a.publishAt,
    inLanguage: HREFLANG[lang], ...(a.author && { author: { "@type": "Person", name: a.author } }), ...(a.cover && { image: absolute(a.cover) }), mainEntityOfPage: url,
    publisher: { "@id": `${base}/#org` }, isPartOf: { "@id": `${base}/#website` }, isAccessibleForFree: true, ...(kw.length && { keywords: kw.join(", ") }), ...(a.category && { articleSection: a.category }),
    audience: { "@type": "Audience", geographicArea: { "@type": "Country", name: "United Arab Emirates" } }, spatialCoverage: { "@type": "Country", name: "United Arab Emirates" },
    ...(faqs.length && { mainEntity: { "@id": `${url}#faq` } }),
  };
  return (
    <article className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Breadcrumbs label={t.catalog.breadcrumb} items={[{ label: t.nav.home, href: `/${lang}` }, { label: t.journalPage.title, href: `/${lang}/journal` }, { label: a.title[lang] }]} />
      <header className="animate-fade-up mt-6">
        {a.category && <p className="text-sm font-semibold text-brand">{a.category}</p>}
        <h1 className="mt-2 font-display text-3xl font-bold leading-tight sm:text-5xl">{a.title[lang]}</h1>
        <p className="mt-3 text-sm text-muted">{date}{a.author ? ` · ${fmtStr(t.journalPage.by, { name: a.author })}` : ""}{updated ? ` · ${lang === "ar" ? "آخر تحديث" : "Updated"} ${updated}` : ""}</p>
      </header>
      <div className="relative mt-6 grid aspect-[16/9] place-items-center overflow-hidden rounded-3xl text-8xl" style={{ background: `linear-gradient(135deg, hsl(${a.hue} 60% 90%), hsl(${a.hue} 55% 76%))` }}>{a.cover ? <Image src={a.cover} alt={a.coverAlt[lang]} fill priority sizes="(min-width:768px) 48rem, 100vw" className="object-cover" /> : <span aria-hidden>{a.icon}</span>}</div>
      {a.excerpt[lang] && <p className="mt-8 text-lg font-medium text-muted">{a.excerpt[lang]}</p>}
      <RichText text={a.body[lang]} className="mt-4 text-lg" />
      <FaqSection faqs={faqs} lang={lang} title={lang === "ar" ? "أسئلة شائعة" : "Frequently asked questions"} id="article-faq" url={url} className="mt-10" />
      <Link href={`/${lang}/journal`} className="mt-10 inline-block text-sm font-semibold text-brand hover:underline">← {t.journalPage.back}</Link>
    </article>
  );
}
