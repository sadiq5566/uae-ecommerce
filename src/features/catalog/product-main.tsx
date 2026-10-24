"use client";
import { useState, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dictionaries";
import { baseName } from "@/lib/variant-name";
import { Gallery } from "./gallery";
import { ProductBuy } from "./product-buy";
import type { ProductDetail } from "./service";

/** Gallery + title + buy box share the selected option, so the picture AND the title follow the chosen colour. */
export function ProductMain({ p, locale, t, children }: { p: ProductDetail; locale: Locale; t: Dictionary; children?: ReactNode }) {
  const first = p.variants.findIndex((v) => v.stock > 0);
  const [vi, setVi] = useState(Math.max(first, 0));
  const v = p.variants[vi];
  const base = baseName(p.name[locale], p.variants.map((x) => x.label[locale]));
  const title = v ? `${base} – ${v.label[locale]}` : p.name[locale];
  // Option pictures that aren't already in the product gallery are appended so every colour has a picture.
  const images = [...p.images, ...p.variants.filter((x) => x.image && !p.images.some((i) => i.url === x.image)).map((x) => ({ url: x.image as string }))]
    .filter((im, k, a) => a.findIndex((z) => z.url === im.url) === k);
  return (
    <div className="mt-6 grid gap-10 lg:grid-cols-2">
      <div className="animate-fade-up"><Gallery images={images} name={title} locale={locale} icon={p.icon} hue={p.hue} labels={{ thumb: t.catalog.thumb }} selectedUrl={v?.image} onPick={(url) => { const k = p.variants.findIndex((x) => x.image === url && (!v?.color || x.color === v.color || !p.variants.some((y) => y.image === url && y.color === v.color))); if (k >= 0) setVi(k); }} /></div>
      <div className="animate-fade-up flex flex-col gap-6 [animation-delay:120ms]">
        <div>
          {p.brand && <p className="text-sm font-semibold text-brand">{p.brand}</p>}
          <h1 className="mt-1 font-display text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-muted">
            {p.ratingCount > 0 ? <><span className="text-gold">★</span> {p.ratingAvg.toFixed(1)} ({p.ratingCount} {t.product.reviews}) · </> : null}
            {t.catalog.sku}: {v?.sku ?? p.sku}
          </p>
        </div>
        <ProductBuy p={p} locale={locale} t={t} vi={vi} setVi={setVi} />
        {children}
      </div>
    </div>
  );
}
