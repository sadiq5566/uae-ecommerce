"use client";
import Image from "@/components/img";
import { useEffect, useRef, useState } from "react";

type Img = { url: string; alt?: { en?: string; ar?: string } };

const arrow = "absolute top-1/2 z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-bg/85 text-xl shadow-card backdrop-blur transition hover:bg-bg active:scale-90";

/**
 * Main image + thumbnails. Arrows / swipe / keyboard move through the pictures, a click opens the full-screen viewer.
 * `selectedUrl` (the chosen colour's picture) jumps to that picture; `onPick` reports the picture a shopper chose so the buy box can select its option.
 * Falls back to the placeholder visual when there are no images.
 */
export function Gallery({ images, name, locale, icon, hue, labels, selectedUrl, onPick }: { images: Img[]; name: string; locale: "en" | "ar"; icon: string; hue: number; labels: { thumb: string }; selectedUrl?: string; onPick?: (url: string) => void }) {
  const [i, setI] = useState(0);
  const [seen, setSeen] = useState(selectedUrl);
  const [open, setOpen] = useState(false);
  const viewer = useRef<HTMLDialogElement>(null);
  const strip = useRef<HTMLUListElement>(null);
  const touch = useRef<number | null>(null);
  const n = images.length;
  const ar = locale === "ar";
  if (seen !== selectedUrl) { // picking an option (e.g. a colour) jumps to that option's picture
    setSeen(selectedUrl);
    const k = images.findIndex((x) => x.url === selectedUrl);
    if (k >= 0) setI(k);
  }
  const go = (k: number, report = true) => { const j = (k + n) % n; setI(j); if (report) onPick?.(images[j].url); };
  const cur = images[Math.min(i, n - 1)];
  const label = (k: number) => images[k]?.alt?.[locale] || name;

  useEffect(() => { strip.current?.children[i]?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); }, [i]);
  useEffect(() => {
    const d = viewer.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const keys = (e: React.KeyboardEvent) => {
    if (n < 2) return;
    const next = e.key === (ar ? "ArrowLeft" : "ArrowRight"), prev = e.key === (ar ? "ArrowRight" : "ArrowLeft");
    if (next || prev) { e.preventDefault(); go(i + (next ? 1 : -1)); }
  };
  const swipe = { onTouchStart: (e: React.TouchEvent) => { touch.current = e.touches[0].clientX; }, onTouchEnd: (e: React.TouchEvent) => {
    if (touch.current == null || n < 2) return;
    const dx = e.changedTouches[0].clientX - touch.current; touch.current = null;
    if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1)); // swiping left shows the next picture
  } };

  return (
    <div onKeyDown={keys}>
      <div className="relative grid aspect-square place-items-center overflow-hidden rounded-3xl" style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 92%), hsl(${hue} 60% 80%))` }} {...swipe}>
        {cur ? (
          <>
            <Image key={cur.url} src={cur.url} alt={label(i)} fill priority={i === 0} sizes="(min-width:1024px) 50vw, 100vw" className="animate-fade-up object-contain" />
            <button type="button" onClick={() => setOpen(true)} aria-label={ar ? "تكبير الصورة" : "Enlarge image"} className="absolute inset-0 z-[5] cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand" />
            <span aria-hidden className="pointer-events-none absolute end-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-bg/85 text-base shadow-card backdrop-blur">⤢</span>
            {n > 1 && <>
              <button type="button" onClick={() => go(i - 1)} aria-label={ar ? "السابق" : "Previous image"} className={`${arrow} start-3`}><span className="flip-rtl">‹</span></button>
              <button type="button" onClick={() => go(i + 1)} aria-label={ar ? "التالي" : "Next image"} className={`${arrow} end-3`}><span className="flip-rtl">›</span></button>
              <span className="absolute bottom-3 start-1/2 z-10 -translate-x-1/2 rounded-full bg-fg/70 px-2.5 py-0.5 text-xs font-medium tabular-nums text-bg" aria-live="polite">{i + 1} / {n}</span>
            </>}
          </>
        ) : <span aria-hidden className="animate-float text-[10rem] drop-shadow-2xl sm:text-[14rem]">{icon}</span>}
      </div>
      {n > 1 && (
        <ul ref={strip} className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" role="list">
          {images.map((im, k) => (
            <li key={im.url + k} className="shrink-0">
              <button type="button" onClick={() => go(k)} aria-label={`${labels.thumb} ${k + 1}`} aria-current={k === i} className={`relative block size-20 overflow-hidden rounded-xl border-2 bg-surface-2 transition ${k === i ? "border-brand" : "border-line opacity-80 hover:border-brand/60 hover:opacity-100"}`}>
                <Image src={im.url} alt="" fill sizes="80px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Full-screen viewer */}
      <dialog ref={viewer} onClose={() => setOpen(false)} onClick={(e) => e.target === viewer.current && setOpen(false)} onKeyDown={keys} aria-label={name} className="m-0 h-dvh max-h-none w-dvw max-w-none bg-black/90 p-0 text-white backdrop:bg-black/90">
        {open && cur && (
          <div className="relative grid h-full grid-rows-[1fr_auto] gap-3 p-3 sm:p-6" {...swipe}>
            <div className="relative min-h-0" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
              <Image key={cur.url} src={cur.url} alt={label(i)} fill sizes="100vw" className="object-contain" />
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label={ar ? "إغلاق" : "Close"} className="absolute end-3 top-3 z-10 grid size-11 place-items-center rounded-full bg-white/15 text-xl backdrop-blur hover:bg-white/30">✕</button>
            {n > 1 && <>
              <button type="button" onClick={() => go(i - 1)} aria-label={ar ? "السابق" : "Previous image"} className="absolute start-3 top-1/2 z-10 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-2xl backdrop-blur hover:bg-white/30"><span className="flip-rtl">‹</span></button>
              <button type="button" onClick={() => go(i + 1)} aria-label={ar ? "التالي" : "Next image"} className="absolute end-3 top-1/2 z-10 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-2xl backdrop-blur hover:bg-white/30"><span className="flip-rtl">›</span></button>
              <ul className="flex justify-center gap-2 overflow-x-auto pb-1" role="list">
                {images.map((im, k) => (
                  <li key={im.url + k} className="shrink-0">
                    <button type="button" onClick={() => go(k)} aria-label={`${labels.thumb} ${k + 1}`} aria-current={k === i} className={`relative block size-14 overflow-hidden rounded-lg border-2 ${k === i ? "border-amber-300" : "border-white/20 opacity-70 hover:opacity-100"}`}>
                      <Image src={im.url} alt="" fill sizes="56px" className="object-cover" />
                    </button>
                  </li>
                ))}
              </ul>
            </>}
          </div>
        )}
      </dialog>
    </div>
  );
}
