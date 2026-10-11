"use client";
import Image from "next/image";
import { useState } from "react";

type Img = { url: string; alt?: { en?: string; ar?: string } };

/** Main image + keyboard-accessible thumbnails. Falls back to the placeholder visual when there are no images. */
export function Gallery({ images, name, locale, icon, hue, labels }: { images: Img[]; name: string; locale: "en" | "ar"; icon: string; hue: number; labels: { thumb: string } }) {
  const [i, setI] = useState(0);
  const cur = images[i];
  return (
    <div>
      <div className="relative grid aspect-square place-items-center overflow-hidden rounded-3xl" style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 92%), hsl(${hue} 60% 80%))` }}>
        {cur ? <Image key={cur.url} src={cur.url} alt={cur.alt?.[locale] || name} fill priority={i === 0} sizes="(min-width:1024px) 50vw, 100vw" className="animate-fade-up object-cover" />
          : <span aria-hidden className="animate-float text-[10rem] drop-shadow-2xl sm:text-[14rem]">{icon}</span>}
      </div>
      {images.length > 1 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1" role="list">
          {images.map((im, k) => (
            <li key={im.url + k} className="shrink-0">
              <button type="button" onClick={() => setI(k)} aria-label={`${labels.thumb} ${k + 1}`} aria-current={k === i} className={`relative block size-20 overflow-hidden rounded-xl border-2 transition ${k === i ? "border-brand" : "border-line hover:border-brand/60"}`}>
                <Image src={im.url} alt="" fill sizes="80px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
