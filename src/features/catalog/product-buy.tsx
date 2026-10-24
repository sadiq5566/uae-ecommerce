"use client";
import Image from "@/components/img";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { addToCartAction } from "@/features/cart/actions";
import { setCartCount } from "@/components/session-store";
import { WishlistButton } from "@/components/wishlist-button";
import { useToast } from "@/components/toast";
import { formatAED, type Locale } from "@/lib/i18n";
import { fmt } from "@/lib/format";
import type { Dictionary } from "@/lib/dictionaries";
import { colorInStock, pickVariant, sizeInStock, swatchFor, variantOptions } from "../../../lib/variants";
import type { ProductDetail } from "./service";

/** Price/stock display and add-to-cart. Display-only: the server recomputes everything at checkout (Phase 4). */
export function ProductBuy({ p, locale, t, vi, setVi }: { p: ProductDetail; locale: Locale; t: Dictionary; vi: number; setVi: (i: number) => void }) {
  const toast = useToast();
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [pulse, setPulse] = useState(0);
  const [pending, start] = useTransition();
  const [going, startGo] = useTransition();
  const v = p.variants[vi];
  const opts = variantOptions(p.variants);
  const pick = (color?: string, size?: string) => { const x = pickVariant(p.variants, color, size); setVi(Math.max(0, p.variants.indexOf(x as (typeof p.variants)[number]))); };
  const price = v?.price ?? p.finalPrice;
  const stock = v ? v.stock : p.stock;
  const off = price < p.price ? Math.round((1 - price / p.price) * 100) : 0;
  const max = Math.min(stock, 10);
  const q = Math.min(qty, Math.max(max, 1));
  const buyUrl = `/${locale}/checkout?buy=${encodeURIComponent(v?.sku ?? p.sku)}&qty=${q}`;
  // Warm the checkout route while the shopper is still deciding, so "Buy now" feels instant.
  useEffect(() => { if (stock > 0) router.prefetch(buyUrl); }, [router, buyUrl, stock]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="flex flex-wrap items-baseline gap-3">
          <span className="text-4xl font-bold">{formatAED(price, locale)}</span>
          {off > 0 && <><s className="text-muted">{formatAED(p.price, locale)}</s><span className="rounded-full bg-danger-solid px-2.5 py-1 text-xs font-bold text-white">{fmt(t.catalog.save, { n: off })}</span></>}
        </p>
        <p className={`mt-2 text-sm font-medium ${stock === 0 ? "text-danger" : stock <= p.lowStockThreshold ? "text-gold-ink" : "text-brand"}`}>
          ● {stock === 0 ? t.catalog.outOfStock : stock <= p.lowStockThreshold ? fmt(t.catalog.lowStock, { n: stock }) : t.catalog.inStock}
        </p>
      </div>
      {(opts.colors.length > 0 || opts.sizes.length > 0) && (
        <div className="flex flex-col gap-4">
          {opts.colors.length > 0 && (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">{locale === "ar" ? "اللون" : "Colour"}: <span className="font-normal text-muted">{v?.color}</span></legend>
              <div className="flex flex-wrap gap-2">
                {opts.colors.map((c) => (
                  <button key={c} type="button" title={c} aria-label={c} aria-pressed={c === v?.color} onClick={() => pick(c, v?.size && sizeInStock(p.variants, v.size, c) ? v.size : p.variants.find((x) => x.color === c && x.stock > 0)?.size)}
                    className={`size-10 rounded-full border-2 p-0.5 ${c === v?.color ? "border-brand" : "border-transparent"} ${colorInStock(p.variants, c) ? "" : "opacity-40"}`}>
                    {(() => { const img = p.variants.find((x) => x.color === c && x.image)?.image; return img ? <span className="relative block size-full overflow-hidden rounded-full border border-line"><Image src={img} alt="" fill sizes="40px" className="object-cover" /></span> : <span className="block size-full rounded-full border border-line" style={{ background: swatchFor(c) }} />; })()}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {opts.sizes.length > 0 && (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">{locale === "ar" ? "المقاس" : "Size"}: <span className="font-normal text-muted">{v?.size}</span></legend>
              <div className="flex flex-wrap gap-2">
                {opts.sizes.map((z) => (
                  <button key={z} type="button" disabled={!sizeInStock(p.variants, z, v?.color)} aria-pressed={z === v?.size} onClick={() => pick(v?.color, z)}
                    className={`h-11 min-w-11 rounded-xl border px-3 text-sm font-medium disabled:line-through disabled:opacity-40 ${z === v?.size ? "border-brand bg-brand-soft" : "border-line"}`}>{z}</button>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      )}
      {p.variants.length > 0 && opts.colors.length === 0 && opts.sizes.length === 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t.catalog.variant}: <span className="font-normal text-muted">{v?.label[locale]}</span></legend>
          <div className="flex flex-wrap gap-2">
            {p.variants.map((x, i) => (
              <label key={x.sku} title={x.label[locale]} className={`cursor-pointer rounded-xl border text-sm font-medium transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${x.image ? "grid w-20 gap-1 p-1 text-center text-xs" : "px-4 py-2"} ${i === vi ? "border-brand bg-brand-soft text-brand ring-2 ring-brand" : "border-line hover:border-brand"} ${x.stock === 0 ? "opacity-50" : ""}`}>
                <input type="radio" name="variant" className="sr-only" checked={i === vi} onChange={() => setVi(i)} />
                {x.image && <span className="relative block aspect-square overflow-hidden rounded-lg"><Image src={x.image} alt="" fill sizes="80px" className="object-cover" /></span>}
                <span className="inline-flex items-center justify-center gap-1.5">{!x.image && x.swatch && <span aria-hidden className="size-4 rounded-full border border-line" style={{ background: x.swatch }} />}<span className="line-clamp-1">{x.label[locale]}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label={t.catalog.quantity} className="flex items-center rounded-xl border border-line">
          <button type="button" aria-label="−" disabled={q <= 1} onClick={() => setQty(q - 1)} className="size-11 text-lg disabled:opacity-40">−</button>
          <output aria-live="polite" className="w-8 text-center font-semibold tabular-nums">{q}</output>
          <button type="button" aria-label="+" disabled={q >= max} onClick={() => setQty(q + 1)} className="size-11 text-lg disabled:opacity-40">+</button>
        </div>
        <button
          disabled={stock === 0 || pending}
          onClick={() => start(async () => {
            const r = await addToCartAction(v?.sku ?? p.sku, q);
            if (r.ok || r.error !== "invalid") setCartCount(r.count); // a rejected request must not zero the badge
            if (r.ok) { toast(t.product.added); setPulse((x) => x + 1); } else toast(t.errors[r.error ?? "generic"] ?? t.errors.generic, "error");
          })}
          className="min-w-48 flex-1 rounded-xl bg-brand px-6 py-3.5 font-semibold text-brand-fg transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span key={pulse} className={pulse ? "animate-pop inline-block" : "inline-block"}>🛒</span> {stock === 0 ? t.catalog.outOfStock : t.product.addToCart}
        </button>
        <button
          type="button" disabled={stock === 0 || pending || going} aria-busy={going}
          onClick={() => startGo(() => router.push(buyUrl))}
          className="min-w-40 flex-1 rounded-xl border-2 border-brand px-6 py-3.5 font-semibold text-brand transition hover:bg-brand-soft active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >{going ? <span className="inline-block animate-spin">⏳</span> : "⚡"} {t.product.buyNow}</button>
        <WishlistButton productId={p.id} locale={locale} label={t.product.save} savedLabel={t.product.saved} loginLabel={t.product.loginToSave} className="!size-12 border border-line" />
      </div>
    </div>
  );
}
