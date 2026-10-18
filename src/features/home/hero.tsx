"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";

export type HeroSlide = { id: string; eyebrow: string; title: string; subtitle: string; cta: string; href: string; secondary?: { label: string; href: string }; image?: string; hue: number; bullets?: string[] };
export type HeroChip = { label: string; href: string; count: number };

const Check = () => <svg aria-hidden viewBox="0 0 20 20" className="size-4 shrink-0 text-amber-300" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="8.25" className="opacity-40" /><path d="m6.5 10.2 2.3 2.3 4.7-4.9" /></svg>;
const btnMain = "inline-flex items-center justify-center gap-2 rounded-full bg-amber-300 px-7 py-3.5 font-semibold text-[#1a1405] shadow-lg shadow-black/20 transition hover:bg-amber-200 hover:shadow-amber-300/30 active:scale-[.98]";
const btnSecondary = "inline-flex items-center justify-center rounded-full border border-white/35 bg-white/5 px-7 py-3.5 font-semibold backdrop-blur transition hover:border-white/60 hover:bg-white/15 active:scale-[.98]";
const localize = (h: string, locale: Locale) => (h.startsWith("/") && !/^\/(en|ar)(\/|$)/.test(h) ? `/${locale}${h}` : h);

function Cta({ href, className, children }: { href: string; className: string; children: React.ReactNode }) {
  return /^https?:/.test(href) ? <a href={href} rel="noopener" className={className}>{children}</a> : <Link href={href} className={className}>{children}</Link>;
}

export function Hero({ slides, locale, labels, chips = [] }: { slides: HeroSlide[]; locale: Locale; labels: { prev: string; next: string; goTo: string }; chips?: HeroChip[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = slides.length;
  useEffect(() => {
    if (n < 2 || paused || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((x) => (x + 1) % n), 7000);
    return () => clearInterval(id);
  }, [n, paused, i]);
  const s = slides[Math.min(i, n - 1)];
  const href = localize(s.href, locale);
  const secondary = s.secondary && { ...s.secondary, href: localize(s.secondary.href, locale) };
  return (
    <section className="relative isolate overflow-hidden rounded-b-[2.5rem] text-white" style={{ background: `linear-gradient(135deg, hsl(${s.hue} 58% 14%), hsl(${(s.hue + 25) % 360} 52% 24%))` }} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} aria-roledescription={n > 1 ? "carousel" : undefined}>
      {s.image && <Image src={s.image} alt="" fill priority sizes="100vw" className="-z-20 object-cover opacity-60" />}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/70 via-black/35 to-black/10 rtl:bg-gradient-to-l" />
      <div aria-hidden className="animate-blob absolute -start-24 -top-24 -z-10 size-[28rem] bg-emerald-400/25 blur-3xl" />
      <div aria-hidden className="animate-blob absolute -bottom-32 end-0 -z-10 size-[32rem] bg-amber-300/20 blur-3xl [animation-delay:-6s]" />
      <div aria-hidden className="absolute inset-0 -z-10 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" />
      {!s.image && (
        <div aria-hidden className="pointer-events-none absolute -end-40 top-1/2 -z-10 hidden aspect-square w-[34rem] -translate-y-1/2 lg:block">
          {[100, 74, 48].map((p, k) => <span key={p} className="absolute rounded-full border border-white/15" style={{ inset: `${(100 - p) / 2}%`, opacity: 1 - k * 0.25 }} />)}
          <span className="absolute inset-[38%] rounded-full bg-gradient-to-br from-amber-300/40 to-transparent blur-2xl" />
        </div>
      )}
      <div className="mx-auto max-w-7xl px-4 pb-24 pt-16 sm:px-6 md:pb-28 md:pt-24 lg:pb-32 lg:pt-28" key={s.id} aria-live={paused ? "polite" : "off"}>
        <div className="max-w-2xl">
          {s.eyebrow && <span className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-semibold tracking-wide backdrop-blur"><span aria-hidden className="size-1.5 rounded-full bg-amber-300" />{s.eyebrow}</span>}
          <h1 className="animate-fade-up mt-5 text-balance font-display text-4xl font-bold leading-[1.08] [animation-delay:100ms] sm:text-5xl lg:text-6xl">{s.title}</h1>
          {s.subtitle && <p className="animate-fade-up mt-5 max-w-xl text-pretty text-base leading-relaxed text-white/80 [animation-delay:200ms] sm:text-lg">{s.subtitle}</p>}
          {(s.cta && href) || secondary ? (
            <div className="animate-fade-up mt-8 flex flex-wrap gap-3 [animation-delay:300ms]">
              {s.cta && href && <Cta href={href} className={btnMain}>{s.cta}<span aria-hidden className="flip-rtl">→</span></Cta>}
              {secondary && <Cta href={secondary.href} className={btnSecondary}>{secondary.label}</Cta>}
            </div>
          ) : null}
          {s.bullets && <ul className="animate-fade-up mt-8 flex flex-wrap gap-x-6 gap-y-2.5 text-sm font-medium text-white/85 [animation-delay:380ms]">{s.bullets.map((b) => <li key={b} className="flex items-center gap-2"><Check />{b}</li>)}</ul>}
          {chips.length > 0 && (
            <nav aria-label="Shop by category" className="animate-fade-up mt-8 flex flex-wrap gap-2 [animation-delay:440ms]">
              {chips.map((c) => <Link key={c.href} href={c.href} className="group flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur transition hover:border-amber-300 hover:bg-white/20">{c.label}<span className="rounded-full bg-white/15 px-2 py-0.5 text-xs text-white/80 group-hover:bg-amber-300 group-hover:text-[#1a1405]">{c.count}</span></Link>)}
            </nav>
          )}
        </div>
      </div>
      {n > 1 && (
        <div className="absolute inset-x-0 bottom-12 flex items-center justify-center gap-2 md:bottom-14">
          <button onClick={() => setI((i - 1 + n) % n)} aria-label={labels.prev} className="grid size-9 place-items-center rounded-full bg-white/15 backdrop-blur transition hover:bg-white/30"><span className="flip-rtl">‹</span></button>
          {slides.map((x, k) => <button key={x.id} onClick={() => setI(k)} aria-label={`${labels.goTo} ${k + 1}`} aria-current={k === i} className={`h-2 rounded-full transition-all ${k === i ? "w-7 bg-amber-300" : "w-2 bg-white/40 hover:bg-white/60"}`} />)}
          <button onClick={() => setI((i + 1) % n)} aria-label={labels.next} className="grid size-9 place-items-center rounded-full bg-white/15 backdrop-blur transition hover:bg-white/30"><span className="flip-rtl">›</span></button>
        </div>
      )}
    </section>
  );
}
