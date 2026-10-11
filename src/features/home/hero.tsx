"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";

export type HeroSlide = { id: string; eyebrow: string; title: string; subtitle: string; cta: string; href: string; secondary?: { label: string; href: string }; image?: string; hue: number; bullets?: string[] };

const floaters = [
  { i: "🎧", c: "start-[8%] top-[12%]", r: "-12deg", d: "0s" },
  { i: "👗", c: "end-[10%] top-[8%]", r: "10deg", d: "1s" },
  { i: "📱", c: "start-[18%] bottom-[8%]", r: "8deg", d: "2s" },
  { i: "🧴", c: "end-[16%] bottom-[14%]", r: "-8deg", d: "0.5s" },
];

export function Hero({ slides, locale, labels }: { slides: HeroSlide[]; locale: Locale; labels: { prev: string; next: string; goTo: string } }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = slides.length;
  useEffect(() => {
    if (n < 2 || paused || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((x) => (x + 1) % n), 7000);
    return () => clearInterval(id);
  }, [n, paused]);
  const s = slides[Math.min(i, n - 1)];
  const href = s.href.startsWith("/") && !/^\/(en|ar)(\/|$)/.test(s.href) ? `/${locale}${s.href}` : s.href;
  const external = /^https?:/.test(href);
  const base = `hsl(${s.hue} 55% 18%)`;
  return (
    <section className="relative isolate overflow-hidden rounded-b-[2.5rem] text-white" style={{ background: base }} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} aria-roledescription={n > 1 ? "carousel" : undefined}>
      {s.image && <Image src={s.image} alt="" fill priority sizes="100vw" className="-z-20 object-cover opacity-40" />}
      <div aria-hidden className="animate-blob absolute -start-24 -top-24 -z-10 size-[28rem] bg-emerald-400/25 blur-3xl" />
      <div aria-hidden className="animate-blob absolute -bottom-32 end-0 -z-10 size-[32rem] bg-amber-300/20 blur-3xl [animation-delay:-6s]" />
      <div aria-hidden className="absolute inset-0 -z-10 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" />
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-2" key={s.id} aria-live={paused ? "polite" : "off"}>
        <div>
          {s.eyebrow && <span className="animate-fade-up inline-block rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-semibold tracking-wide backdrop-blur">✨ {s.eyebrow}</span>}
          <h1 className="animate-fade-up mt-5 font-display text-4xl font-bold leading-[1.1] [animation-delay:120ms] sm:text-5xl lg:text-6xl">{s.title}</h1>
          {s.subtitle && <p className="animate-fade-up mt-5 max-w-xl text-base text-white/75 [animation-delay:240ms] sm:text-lg">{s.subtitle}</p>}
          <div className="animate-fade-up mt-8 flex flex-wrap gap-3 [animation-delay:360ms]">
            {s.cta && href && (external ? <a href={href} rel="noopener" className="rounded-full bg-amber-300 px-7 py-3.5 font-semibold text-[#1a1405] transition hover:scale-105 hover:shadow-lg hover:shadow-amber-300/30 active:scale-95">{s.cta}</a>
              : <Link href={href} className="rounded-full bg-amber-300 px-7 py-3.5 font-semibold text-[#1a1405] transition hover:scale-105 hover:shadow-lg hover:shadow-amber-300/30 active:scale-95">{s.cta}</Link>)}
            {s.secondary && <a href={s.secondary.href} className="rounded-full border border-white/30 px-7 py-3.5 font-semibold backdrop-blur transition hover:bg-white/10">{s.secondary.label}</a>}
          </div>
          {s.bullets && <ul className="animate-fade-up mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70 [animation-delay:480ms]">{s.bullets.map((b) => <li key={b} className="flex items-center gap-2"><span className="text-amber-300">●</span>{b}</li>)}</ul>}
        </div>
        <div aria-hidden className="relative mx-auto hidden aspect-square w-full max-w-md lg:block">
          <div className="absolute inset-8 rounded-full bg-gradient-to-br from-emerald-300/30 to-amber-200/20 ring-1 ring-white/20 backdrop-blur-sm" />
          <div className="animate-float absolute inset-0 grid place-items-center text-[9rem] drop-shadow-2xl">🛍️</div>
          {floaters.map((f) => <span key={f.i} className={`animate-float absolute grid size-16 place-items-center rounded-2xl bg-white/15 text-3xl shadow-xl ring-1 ring-white/25 backdrop-blur ${f.c}`} style={{ "--r": f.r, animationDelay: f.d } as React.CSSProperties}>{f.i}</span>)}
        </div>
      </div>
      {n > 1 && (
        <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-2">
          <button onClick={() => setI((i - 1 + n) % n)} aria-label={labels.prev} className="grid size-8 place-items-center rounded-full bg-white/15 hover:bg-white/25"><span className="flip-rtl">‹</span></button>
          {slides.map((x, k) => <button key={x.id} onClick={() => setI(k)} aria-label={`${labels.goTo} ${k + 1}`} aria-current={k === i} className={`h-2 rounded-full transition-all ${k === i ? "w-6 bg-amber-300" : "w-2 bg-white/40 hover:bg-white/60"}`} />)}
          <button onClick={() => setI((i + 1) % n)} aria-label={labels.next} className="grid size-8 place-items-center rounded-full bg-white/15 hover:bg-white/25"><span className="flip-rtl">›</span></button>
        </div>
      )}
    </section>
  );
}
