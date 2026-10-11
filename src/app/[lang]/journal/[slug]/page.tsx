import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { fmt as fmtStr } from "@/lib/format";
import { RichText } from "@/components/rich-text";
import { Breadcrumbs } from "@/features/catalog/breadcrumbs";
import { alternatesFor } from "@/features/catalog/seo";
import { getArticle } from "@/features/content/service";

export async function generateMetadata({ params }: PageProps<"/[lang]/journal/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLocale(lang)) return {};
  const a = await getArticle(slug);
  if (!a) return {};
  const desc = a.seo.description[lang] || a.excerpt[lang];
  return { title: a.seo.title[lang] || a.title[lang], description: desc || undefined, alternates: alternatesFor(lang, `/journal/${slug}`), openGraph: { title: a.title[lang], description: desc || undefined, type: "article", publishedTime: a.publishAt, images: a.cover ? [a.cover] : undefined } };
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
  const jsonLd = { "@context": "https://schema.org", "@type": "Article", headline: a.title[lang], datePublished: a.publishAt, inLanguage: lang, ...(a.author && { author: { "@type": "Person", name: a.author } }), ...(a.cover && { image: a.cover }), mainEntityOfPage: `${base}/${lang}/journal/${a.slug}` };
  return (
    <article className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Breadcrumbs label={t.catalog.breadcrumb} items={[{ label: t.nav.home, href: `/${lang}` }, { label: t.journalPage.title, href: `/${lang}/journal` }, { label: a.title[lang] }]} />
      <header className="animate-fade-up mt-6">
        {a.category && <p className="text-sm font-semibold text-brand">{a.category}</p>}
        <h1 className="mt-2 font-display text-3xl font-bold leading-tight sm:text-5xl">{a.title[lang]}</h1>
        <p className="mt-3 text-sm text-muted">{date}{a.author ? ` · ${fmtStr(t.journalPage.by, { name: a.author })}` : ""}</p>
      </header>
      <div className="relative mt-6 grid aspect-[16/9] place-items-center overflow-hidden rounded-3xl text-8xl" style={{ background: `linear-gradient(135deg, hsl(${a.hue} 60% 90%), hsl(${a.hue} 55% 76%))` }}>{a.cover ? <Image src={a.cover} alt={a.coverAlt[lang]} fill priority sizes="(min-width:768px) 48rem, 100vw" className="object-cover" /> : <span aria-hidden>{a.icon}</span>}</div>
      {a.excerpt[lang] && <p className="mt-8 text-lg font-medium text-muted">{a.excerpt[lang]}</p>}
      <RichText text={a.body[lang]} className="mt-4 text-lg" />
      <Link href={`/${lang}/journal`} className="mt-10 inline-block text-sm font-semibold text-brand hover:underline">← {t.journalPage.back}</Link>
    </article>
  );
}
