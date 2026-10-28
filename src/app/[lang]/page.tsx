import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { alternatesFor, homeDescription, homeTitle } from "@/features/catalog/seo";
import { getBrand } from "@/lib/email";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { getCategories, getCollection, getShowcase } from "@/features/catalog/service";
import { buildMenu, MAIN_SLUGS } from "@/features/catalog/menu";
import { getStoreBrands } from "@/features/catalog/brands";
import { getHomeConfig, listArticles } from "@/features/content/service";
import { Hero, type HeroSlide } from "@/features/home/hero";
import { CategoryShowcase, CategorySpotlight, Journal, ProductSection, TrustBar } from "@/features/home/sections";

export const revalidate = 60; // home content refreshes at most once a minute (admin saves also revalidate it)

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const title = homeTitle(lang, (await getBrand(lang)).name), description = homeDescription(lang);
  return { title: { absolute: title }, description, alternates: alternatesFor(lang, ""), openGraph: { title, description, url: `/${lang}` }, twitter: { title, description } };
}

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const ar = lang === "ar";
  const [t, categories, showcase, cfg, articles] = await Promise.all([getDictionary(lang), getCategories(), getShowcase(), getHomeConfig(), listArticles(3)]);
  const menu = buildMenu(categories, showcase, await getStoreBrands().catch(() => []));
  const sec = cfg.sections;
  // Every row below is limited to the lead categories (jewelry, perfume, watches, bags, glasses, caps).
  const [deals, trending, bestSellers, newest, ...perCategory] = await Promise.all([
    sec.deals ? getCollection("deals", 4, MAIN_SLUGS) : [], sec.mostViewed ? getCollection("viewed", 4, MAIN_SLUGS) : [],
    sec.popular ? getCollection("popular", 4, MAIN_SLUGS) : [], sec.newArrivals ? getCollection("new", 4, MAIN_SLUGS) : [],
    ...menu.main.map((c) => getCollection("category", c.slug === "perfume" ? 10 : 4, [c.slug])),
  ]);
  const p = { locale: lang, t };
  const tiles = menu.main.map((c) => ({ label: c.name[lang], href: `/${lang}/c/${c.slug}`, image: c.image, count: c.count }));
  // Admin-managed campaign banners, or the built-in default hero.
  const slides: HeroSlide[] = cfg.slides.length
    ? cfg.slides.map((s) => ({ id: s.id, eyebrow: s.eyebrow[lang], title: s.title[lang], subtitle: s.subtitle[lang], cta: s.ctaLabel[lang], href: s.ctaHref ?? "", image: s.image, hue: s.hue }))
    : [{
      id: "default", eyebrow: ar ? "مجموعة جديدة" : "New season collection",
      title: ar ? "مجوهرات وعطور وساعات وحقائب لكل ذوق" : "Jewelry, perfume, watches & bags for every style",
      subtitle: ar ? "تشكيلة مختارة من أفخم الماركات مع توصيل سريع والدفع عند الاستلام." : "A curated edit from the world's best-loved brands, with fast delivery and cash on delivery.",
      cta: ar ? "تسوق العروض" : "Shop deals", href: `/${lang}/deals`, hue: 345, secondary: { label: ar ? "وصل حديثاً" : "New arrivals", href: `/${lang}/new` }, bullets: [t.hero.stat1, t.hero.stat2, t.hero.stat3],
    }];
  return (
    <>
      <Hero slides={slides} locale={lang} labels={t.heroNav} tiles={tiles} />
      <TrustBar t={t} />
      <CategoryShowcase {...p} menu={menu} />
      {menu.main.map((c, i) => c.slug === "perfume" && <CategorySpotlight key={c.slug} {...p} eyebrow={ar ? "عطور مختارة" : "Signature scents"} title={c.name[lang]} sub={ar ? "عطور فاخرة من أشهر الدور العالمية، بأحجام مناسبة للهدية والاستخدام اليومي." : "Luxury fragrances from the most loved houses, in sizes made for gifting and everyday wear."} items={perCategory[i]} href={`/${lang}/c/${c.slug}`} image={c.image} />)}
      <ProductSection {...p} title={t.sections.deals} sub={t.sections.dealsSub} items={deals} href={`/${lang}/deals`} />
      <ProductSection {...p} title={t.catalog.popular} sub={t.catalog.popularSub} items={trending} />
      {menu.main.map((c, i) => c.slug !== "perfume" && <ProductSection key={c.slug} {...p} title={c.name[lang]} sub={c.tagline[lang]} items={perCategory[i]} href={`/${lang}/c/${c.slug}`} />)}
      <ProductSection {...p} title={t.catalog.bestSellers} sub={t.catalog.bestSellersSub} items={bestSellers} />
      <ProductSection {...p} title={t.catalog.newTitle} sub={t.catalog.newSub} items={newest} href={`/${lang}/new`} />
      {sec.journal && <Journal {...p} articles={articles.items} />}
    </>
  );
}
