import Link from "next/link";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/i18n";
import Image from "next/image";
import type { ArticleView } from "@/features/content/service";
import type { CategoryView, ProductCardData } from "@/features/catalog/service";
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

export function CategoryGrid({ locale, t, categories }: P & { categories: CategoryView[] }) {
  const top = categories.filter((c) => !c.parent);
  if (!top.length) return null;
  return (
    <section id="categories" className={`${wrap} scroll-mt-32 pt-20`}>
      <Heading title={t.sections.categories} sub={t.sections.categoriesSub} />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
        {top.map((c, i) => (
          <Reveal key={c.slug} delay={i * 50}>
            <Link href={`/${locale}/c/${c.slug}`} className="group flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-4 text-center transition duration-300 hover:-translate-y-1 hover:border-brand hover:shadow-card">
              <span className="grid size-14 place-items-center rounded-full text-3xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6" style={{ background: `hsl(${c.hue} 70% 90% / 0.9)` }}>{c.icon}</span>
              <span className="text-xs font-medium leading-tight sm:text-sm">{c.name[locale]}</span>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function Marquee({ locale, categories }: { locale: Locale; categories: CategoryView[] }) {
  const words = categories.filter((c) => !c.parent).map((c) => c.name[locale]);
  if (!words.length) return null;
  const row = [...words, ...words];
  return (
    <div aria-hidden className="mt-20 overflow-hidden border-y border-line bg-surface-2 py-4">
      <div className="animate-marquee flex w-max gap-10 whitespace-nowrap font-display text-2xl font-bold text-muted/60">
        {[...row, ...row].map((w, i) => <span key={i} className="flex items-center gap-10">{w} <span className="text-gold">✦</span></span>)}
      </div>
    </div>
  );
}

export function ProductSection({ locale, t, title, sub, items, href, countdown }: P & { title: string; sub: string; items: ProductCardData[]; href?: string; countdown?: boolean }) {
  if (!items.length) return null;
  return (
    <section className={`${wrap} pt-20`}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <Heading title={title} sub={sub} href={href} cta={t.sections.viewAll} />
        {countdown && <div className="flex items-center gap-3"><span className="text-sm font-medium text-muted">{t.sections.endsIn}</span><Countdown units={t.time} /></div>}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {items.map((p, i) => <Reveal key={p.id} delay={i * 80}><ProductCard p={p} locale={locale} t={t} /></Reveal>)}
      </div>
    </section>
  );
}

export function Journal({ locale, t, articles }: P & { articles: ArticleView[] }) {
  if (!articles.length) return null;
  return (
    <section className={`${wrap} pt-20`}>
      <Heading title={t.sections.journal} sub={t.sections.journalSub} href={`/${locale}/journal`} cta={t.sections.viewAll} />
      <div className="grid gap-4 md:grid-cols-3">
        {articles.map((a, i) => (
          <Reveal key={a.slug} delay={i * 100}>
            <Link href={`/${locale}/journal/${a.slug}`} className="group block h-full overflow-hidden rounded-2xl border border-line bg-surface transition duration-300 hover:-translate-y-1 hover:shadow-card">
              <div className="relative grid h-40 place-items-center overflow-hidden text-6xl transition-transform duration-500 group-hover:scale-105" style={{ background: `linear-gradient(135deg, hsl(${a.hue} 60% 90%), hsl(${a.hue} 55% 78%))` }}>
                {a.cover ? <Image src={a.cover} alt={a.coverAlt[locale]} fill sizes="(min-width:768px) 33vw, 100vw" className="object-cover" /> : <span aria-hidden>{a.icon}</span>}
              </div>
              <div className="p-5">
                {a.category && <p className="text-xs font-semibold text-brand">{a.category}</p>}
                <h3 className="mt-2 font-display text-lg font-bold leading-snug">{a.title[locale]}</h3>
                {a.excerpt[locale] && <p className="mt-2 line-clamp-2 text-sm text-muted">{a.excerpt[locale]}</p>}
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
