import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { getCategories, getCollection } from "@/features/catalog/service";
import { getHomeConfig, listArticles } from "@/features/content/service";
import { Hero, type HeroSlide } from "@/features/home/hero";
import { CategoryGrid, Journal, Marquee, ProductSection, TrustBar } from "@/features/home/sections";

export const revalidate = 60; // home content refreshes at most once a minute (admin saves also revalidate it)

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const [t, categories, cfg, articles] = await Promise.all([getDictionary(lang), getCategories(), getHomeConfig(), listArticles(3)]);
  const sec = cfg.sections;
  const [deals, featured, popular, newest, viewed] = await Promise.all([
    sec.deals ? getCollection("deals") : [], sec.featured ? getCollection("featured") : [], sec.popular ? getCollection("popular") : [],
    sec.newArrivals ? getCollection("new") : [], sec.mostViewed ? getCollection("viewed") : [],
  ]);
  const p = { locale: lang, t };
  // Admin-managed campaign banners, or the built-in default hero.
  const slides: HeroSlide[] = cfg.slides.length
    ? cfg.slides.map((s) => ({ id: s.id, eyebrow: s.eyebrow[lang], title: s.title[lang], subtitle: s.subtitle[lang], cta: s.ctaLabel[lang], href: s.ctaHref ?? "", image: s.image, hue: s.hue }))
    : [{ id: "default", eyebrow: t.hero.eyebrow, title: t.hero.title, subtitle: t.hero.subtitle, cta: t.hero.cta, href: `/${lang}/deals`, secondary: { label: t.hero.ctaSecondary, href: "#categories" }, hue: 165, bullets: [t.hero.stat1, t.hero.stat2, t.hero.stat3] }];
  return (
    <>
      <Hero slides={slides} locale={lang} labels={t.heroNav} />
      <TrustBar t={t} />
      <CategoryGrid {...p} categories={categories} />
      <Marquee locale={lang} categories={categories} />
      <ProductSection {...p} title={t.sections.deals} sub={t.sections.dealsSub} items={deals} href={`/${lang}/deals`} countdown />
      <ProductSection {...p} title={t.sections.featured} sub={t.sections.featuredSub} items={featured} />
      <ProductSection {...p} title={t.catalog.newTitle} sub={t.catalog.newSub} items={newest} href={`/${lang}/new`} />
      <ProductSection {...p} title={t.catalog.popular} sub={t.catalog.popularSub} items={viewed} />
      <ProductSection {...p} title={t.catalog.bestSellers} sub={t.catalog.bestSellersSub} items={popular} />
      {sec.journal && <Journal {...p} articles={articles.items} />}
    </>
  );
}
