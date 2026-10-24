import Link from "next/link";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/i18n";
import Image from "@/components/img";
import type { ArticleView } from "@/features/content/service";
import type { ProductCardData } from "@/features/catalog/service";
import type { Menu } from "@/features/catalog/menu";
import { Countdown } from "@/components/countdown";
import { ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";

type P = { locale: Locale; t: Dictionary };

function Heading({ title, sub, href, cta }: { title: string; sub: string; href?: string; cta?: string }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-display text-2xl font-bold sm:text-3xl">{title}</h2>
        <p className="mt-1 text-sm text-muted">{sub}</p>
      </div>
      {href && <Link href={href} className="shrink-0 text-sm font-semibold text-brand hover:underline">{cta} <span className="flip-rtl inline-block">→</span></Link>}
    </div>
  );
}
const wrap = "mx-auto max-w-7xl px-4 sm:px-6";

export function TrustBar({ t }: Pick<P, "t">) {
  const items = [["🚚", t.trust.t1, t.trust.d1], ["🔒", t.trust.t2, t.trust.d2], ["↩️", t.trust.t3, t.trust.d3], ["💬", t.trust.t4, t.trust.d4]];
  return (
    <div className={`${wrap} -mt-8 relative z-10`}>
      <Reveal className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-card lg:grid-cols-4">
        {items.map(([i, a, b]) => (
          <div key={a} className="flex items-center gap-3 bg-surface p-4">
            <span className="text-2xl">{i}</span>
            <div><p className="text-sm font-semibold">{a}</p><p className="text-xs text-muted">{b}</p></div>
          </div>
        ))}
      </Reveal>
    </div>
  );
}

/** The four lead categories as big picture cards, then the smaller categories / brands as chips. */
export function CategoryShowcase({ locale, t, menu }: P & { menu: Menu }) {
  if (!menu.main.length) return null;
  const ar = locale === "ar";
  return (
    <section id="categories" className={`${wrap} scroll-mt-32 pt-12 sm:pt-16`}>
      <Heading title={t.sections.categories} sub={t.sections.categoriesSub} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {menu.main.map((c, i) => (
          <Reveal key={c.slug} delay={i * 70}>
            <Link href={`/${locale}/c/${c.slug}`} className="group relative block aspect-[4/5] overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-card">
              {c.image && <Image src={c.image} alt="" fill sizes="(min-width:1024px) 25vw, 50vw" className="object-cover transition duration-500 group-hover:scale-110" />}
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-16 text-white sm:p-5 sm:pt-20">
                <span className="block font-display text-lg font-bold leading-tight sm:text-xl">{c.name[locale]}</span>
                <span className="mt-0.5 block text-xs text-white/80 sm:text-sm">{c.tagline[locale]}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-300">{ar ? "تسوق الآن" : "Shop now"} <span className="flip-rtl transition-transform group-hover:translate-x-1">→</span></span>
              </span>
            </Link>
          </Reveal>
        ))}
      </div>
      {(menu.more.length > 0 || menu.brands.length > 0) && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="me-1 text-sm font-medium text-muted">{ar ? "المزيد:" : "Also shop:"}</span>
          {[...menu.more, ...menu.brands].map((c) => <Link key={c.slug} href={c.kind === "brand" ? `/${locale}/brands/${c.slug}` : `/${locale}/c/${c.slug}`} className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium transition hover:border-brand hover:text-brand">{c.name[locale]}</Link>)}
        </div>
      )}
    </section>
  );
}

export function Marquee({ locale, menu }: { locale: Locale; menu: Menu }) {
  const words = menu.main.map((c) => c.name[locale]);
  if (!words.length) return null;
  const row = [...words, ...words];
  return (
    <div aria-hidden className="mt-20 overflow-hidden border-y border-line bg-surface-2 py-4">
      <div className="animate-marquee flex w-max gap-10 whitespace-nowrap font-display text-2xl font-bold text-muted">
        {[...row, ...row].map((w, i) => <span key={i} className="flex items-center gap-10">{w} <span className="text-gold-ink">✦</span></span>)}
      </div>
    </div>
  );
}

/** Phones: swipeable row with snap; desktop: a grid. */
const rail = "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4 [&>*]:w-[46%] [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-auto";

export function ProductSection({ locale, t, title, sub, items, href, countdown }: P & { title: string; sub: string; items: ProductCardData[]; href?: string; countdown?: boolean }) {
  if (!items.length) return null;
  return (
    <section className={`${wrap} pt-14 sm:pt-20`}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
        <Heading title={title} sub={sub} href={href} cta={t.sections.viewAll} />
        {countdown && <div className="flex items-center gap-3"><span className="text-sm font-medium text-muted">{t.sections.endsIn}</span><Countdown units={t.time} /></div>}
      </div>
      <div className={rail}>
        {items.map((p, i) => <Reveal key={p.id} delay={i * 60}><ProductCard p={p} locale={locale} t={t} /></Reveal>)}
      </div>
    </section>
  );
}

/** A full-width feature block for one category (perfume): coloured panel with the story on one side and a swipeable row of products. */
export function CategorySpotlight({ locale, t, title, sub, items, href, image, eyebrow }: P & { title: string; sub: string; items: ProductCardData[]; href: string; image?: string; eyebrow: string }) {
  if (!items.length) return null;
  const ar = locale === "ar";
  return (
    <section className={`${wrap} pt-14 sm:pt-20`}>
      <div className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-[#2a1230] via-[#4a1d4f] to-[#7a2d5c] p-5 text-white sm:p-8 lg:p-10">
        <div aria-hidden className="absolute -end-20 -top-20 -z-10 size-72 rounded-full bg-fuchsia-400/25 blur-3xl" />
        <div aria-hidden className="absolute -bottom-24 start-1/3 -z-10 size-72 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="grid items-center gap-6 lg:grid-cols-[18rem_1fr] lg:gap-10">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1 text-xs font-semibold backdrop-blur">{eyebrow}</span>
            <h2 className="mt-4 font-display text-3xl font-bold leading-tight sm:text-4xl">{title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/80">{sub}</p>
            <Link href={href} className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-[#1a1405] shadow-lg shadow-black/20 transition hover:bg-amber-200 active:scale-[.98]">{ar ? "تسوقي كل العطور" : "Shop all perfumes"} <span className="flip-rtl">→</span></Link>
            {image && <div aria-hidden className="relative mt-6 hidden aspect-[4/3] overflow-hidden rounded-2xl border border-white/20 lg:block"><Image src={image} alt="" fill sizes="18rem" className="object-cover opacity-90" /></div>}
          </div>
          <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 text-fg [scrollbar-width:none] sm:mx-0 sm:px-0 [&>*]:w-[48%] [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-[30%] lg:[&>*]:w-[23%]">
            {items.map((p) => <ProductCard key={p.id} p={p} locale={locale} t={t} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

const readMins = (text: string) => Math.max(1, Math.round(text.trim().split(/\s+/).length / 200));

function StoryVisual({ a, locale, big }: { a: ArticleView; locale: Locale; big?: boolean }) {
  return (
    <div className={`relative isolate grid place-items-center overflow-hidden ${big ? "h-56 sm:h-72 lg:h-full lg:min-h-[22rem]" : "h-36 w-36 shrink-0 sm:h-auto sm:w-40"}`} style={{ background: `linear-gradient(145deg, hsl(${a.hue} 65% 93%), hsl(${a.hue} 55% 76%))` }}>
      {a.cover ? <Image src={a.cover} alt={a.coverAlt[locale]} fill sizes={big ? "(min-width:1024px) 55vw, 100vw" : "160px"} className="object-contain p-4 mix-blend-multiply transition-transform duration-500 group-hover:scale-105" /> : (
        <>
          <span aria-hidden className="absolute -end-10 -top-10 size-40 rounded-full opacity-40 blur-2xl" style={{ background: `hsl(${a.hue} 80% 70%)` }} />
          <span aria-hidden className="absolute -bottom-12 -start-8 size-36 rounded-full border-[18px] opacity-30" style={{ borderColor: `hsl(${a.hue} 60% 100%)` }} />
          <span aria-hidden className={`relative drop-shadow-sm transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6 ${big ? "text-8xl" : "text-5xl"}`}>{a.icon}</span>
        </>
      )}
      {a.category && <span className="absolute start-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-neutral-800 shadow-sm backdrop-blur">{a.category}</span>}
    </div>
  );
}

function StoryMeta({ a, locale }: { a: ArticleView; locale: Locale }) {
  const ar = locale === "ar";
  const mins = readMins(a.body[locale] || a.excerpt[locale]);
  const date = new Date(a.publishAt).toLocaleDateString(ar ? "ar-AE" : "en-AE", { day: "numeric", month: "short", year: "numeric" });
  return <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted"><time dateTime={a.publishAt}>{date}</time><span aria-hidden>·</span><span>{ar ? `${mins} د قراءة` : `${mins} min read`}</span></p>;
}

export function Journal({ locale, t, articles }: P & { articles: ArticleView[] }) {
  if (!articles.length) return null;
  const ar = locale === "ar";
  const [lead, ...rest] = articles;
  const card = "group overflow-hidden rounded-2xl border border-line bg-surface transition duration-300 hover:-translate-y-1 hover:shadow-card";
  return (
    <section className={`${wrap} pb-16 pt-20 sm:pb-24`}>
      <Heading title={t.sections.journal} sub={t.sections.journalSub} href={`/${locale}/journal`} cta={t.sections.viewAll} />
      <div className={`grid gap-5 ${rest.length ? "lg:grid-cols-[1.35fr_1fr]" : ""}`}>
        <Reveal>
          <Link href={`/${locale}/journal/${lead.slug}`} className={`${card} grid h-full lg:grid-cols-1`}>
            <StoryVisual a={lead} locale={locale} big />
            <div className="p-6">
              <StoryMeta a={lead} locale={locale} />
              <h3 className="mt-2 font-display text-2xl font-bold leading-snug sm:text-3xl">{lead.title[locale]}</h3>
              {lead.excerpt[locale] && <p className="mt-3 line-clamp-3 text-muted">{lead.excerpt[locale]}</p>}
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">{ar ? "اقرأ المقال" : "Read the story"} <span className="flip-rtl transition-transform group-hover:translate-x-1">→</span></span>
            </div>
          </Link>
        </Reveal>
        {rest.length > 0 && (
          <div className="flex flex-col gap-5">
            {rest.map((a, i) => (
              <Reveal key={a.slug} delay={(i + 1) * 100} className="flex-1">
                <Link href={`/${locale}/journal/${a.slug}`} className={`${card} flex h-full flex-row`}>
                  <StoryVisual a={a} locale={locale} />
                  <div className="flex min-w-0 flex-1 flex-col justify-center p-4 sm:p-5">
                    <StoryMeta a={a} locale={locale} />
                    <h3 className="mt-1.5 font-display text-lg font-bold leading-snug">{a.title[locale]}</h3>
                    {a.excerpt[locale] && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{a.excerpt[locale]}</p>}
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
