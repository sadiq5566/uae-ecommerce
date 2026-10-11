"use client";
import { useState } from "react";
import { useTransition } from "react";
import { addToCartAction } from "@/features/cart/actions";
import { setCartCount } from "@/components/session-store";
import { WishlistButton } from "@/components/wishlist-button";
import { useToast } from "@/components/toast";
import { formatAED, type Locale } from "@/lib/i18n";
import { fmt } from "@/lib/format";
import type { Dictionary } from "@/lib/dictionaries";
import type { ProductDetail } from "./service";

/** Price/stock display and add-to-cart. Display-only: the server recomputes everything at checkout (Phase 4). */
export function ProductBuy({ p, locale, t }: { p: ProductDetail; locale: Locale; t: Dictionary }) {
  const toast = useToast();
  const [vi, setVi] = useState(0);
  const [qty, setQty] = useState(1);
  const [pulse, setPulse] = useState(0);
  const [pending, start] = useTransition();
  const v = p.variants[vi];
  const price = v?.price ?? p.finalPrice;
  const stock = v ? v.stock : p.stock;
  const off = price < p.price ? Math.round((1 - price / p.price) * 100) : 0;
  const max = Math.min(stock, 10);
  const q = Math.min(qty, Math.max(max, 1));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="flex flex-wrap items-baseline gap-3">
          <span className="text-4xl font-bold">{formatAED(price, locale)}</span>
          {off > 0 && <><s className="text-muted">{formatAED(p.price, locale)}</s><span className="rounded-full bg-danger px-2.5 py-1 text-xs font-bold text-white">{fmt(t.catalog.save, { n: off })}</span></>}
        </p>
        <p className={`mt-2 text-sm font-medium ${stock === 0 ? "text-danger" : stock <= p.lowStockThreshold ? "text-gold" : "text-brand"}`}>
          ● {stock === 0 ? t.catalog.outOfStock : stock <= p.lowStockThreshold ? fmt(t.catalog.lowStock, { n: stock }) : t.catalog.inStock}
        </p>
      </div>
      {p.variants.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t.catalog.variant}</legend>
          <div className="flex flex-wrap gap-2">
            {p.variants.map((x, i) => (
              <label key={x.sku} className={`cursor-pointer rounded-xl border px-4 py-2 text-sm font-medium transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${i === vi ? "border-brand bg-brand-soft text-brand" : "border-line hover:border-brand"} ${x.stock === 0 ? "opacity-50" : ""}`}>
                <input type="radio" name="variant" className="sr-only" checked={i === vi} onChange={() => setVi(i)} />{x.label[locale]}
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
            setCartCount(r.count);
            if (r.ok) { toast(t.product.added); setPulse((x) => x + 1); } else toast(t.errors[r.error ?? "generic"] ?? t.errors.generic, "error");
          })}
          className="min-w-48 flex-1 rounded-xl bg-brand px-6 py-3.5 font-semibold text-brand-fg transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span key={pulse} className={pulse ? "animate-pop inline-block" : "inline-block"}>🛒</span> {stock === 0 ? t.catalog.outOfStock : t.product.addToCart}
        </button>
        <WishlistButton productId={p.id} locale={locale} label={t.product.save} savedLabel={t.product.saved} loginLabel={t.product.loginToSave} className="!size-12 border border-line" />
      </div>
    </div>
  );
}
