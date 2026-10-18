"use client";
import Image from "next/image";
import Link from "next/link";
import { useTransition } from "react";
import { setCartCount } from "@/components/session-store";
import { useToast } from "@/components/toast";
import type { Dictionary } from "@/lib/dictionaries";
import { fmt } from "@/lib/format";
import { formatAED, type Locale } from "@/lib/i18n";
import { removeFromCartAction, setQtyAction } from "./actions";
import type { CartLine, CartView } from "./service";

export function CartLines({ cart, locale, t, progress }: { cart: CartView; locale: Locale; t: Dictionary; progress?: React.ReactNode }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const run = (fn: () => ReturnType<typeof setQtyAction>) => start(async () => {
    const r = await fn();
    setCartCount(r.count);
    if (!r.ok) toast(t.errors[r.error ?? "generic"] ?? t.errors.generic, "error");
  });
  const note = (l: CartLine) => {
    if (l.status === "unavailable") return t.cart.unavailable;
    if (l.status === "out_of_stock") return t.cart.outOfStock;
    if (l.status === "reduced") return fmt(t.cart.reduced, { n: l.stock });
    if (l.priceChanged) return fmt(t.cart.priceChanged, { old: formatAED(l.priceAtAdd, locale) });
    return null;
  };
  return (
    <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]" aria-busy={pending}>
      <div className="flex min-w-0 flex-col gap-4">
      {progress}
      <ul className={`flex min-w-0 flex-col gap-4 transition-opacity ${pending ? "opacity-60" : ""}`}>
        {cart.lines.map((l) => {
          const n = note(l);
          return (
            <li key={l.sku} className="animate-slide-in flex min-w-0 gap-3 rounded-2xl sm:gap-4 border border-line bg-surface p-4">
              <div className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl text-3xl sm:size-24 sm:text-4xl" style={{ background: `linear-gradient(135deg, hsl(${l.hue} 70% 92%), hsl(${l.hue} 60% 82%))` }} aria-hidden>{l.image ? <Image src={l.image} alt="" fill sizes="96px" className="object-cover" /> : l.icon}</div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {l.slug ? <Link href={`/${locale}/p/${l.slug}`} className="line-clamp-2 font-medium hover:text-brand">{l.name[locale]}</Link> : <p className="font-medium">{l.name[locale]}</p>}
                    {l.variantLabel && <p className="text-xs text-muted">{l.variantLabel[locale]}</p>}
                  </div>
                  <p className="shrink-0 font-bold">{formatAED(l.lineTotal, locale)}</p>
                </div>
                {n && <p role="alert" className="text-xs font-medium text-gold-ink">⚠ {n}</p>}
                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  {l.stock > 0 ? (
                    <div role="group" aria-label={t.catalog.quantity} className="flex items-center rounded-xl border border-line">
                      <button aria-label="−" disabled={pending} onClick={() => run(() => setQtyAction(l.sku, l.qty - 1))} className="size-9 disabled:opacity-40">−</button>
                      <output className="w-8 text-center text-sm font-semibold tabular-nums">{l.qty}</output>
                      <button aria-label="+" disabled={pending || l.qty >= Math.min(l.stock, 10)} onClick={() => run(() => setQtyAction(l.sku, l.qty + 1))} className="size-9 disabled:opacity-40">+</button>
                    </div>
                  ) : <span />}
                  <button disabled={pending} onClick={() => run(() => removeFromCartAction(l.sku))} className="text-sm text-muted transition hover:text-danger">{t.cart.remove}</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      </div>
      <aside className="h-fit rounded-2xl border border-line bg-surface p-6 lg:sticky lg:top-32">
        <p className="flex justify-between text-sm text-muted"><span>{fmt(t.cart.items, { n: cart.itemCount })}</span></p>
        <p className="mt-3 flex items-baseline justify-between"><span className="font-semibold">{t.cart.subtotal}</span><span className="text-2xl font-bold">{formatAED(cart.subtotal, locale)}</span></p>
        <p className="mt-3 text-xs text-muted">{t.cart.checkoutNote}</p>
        {cart.lines.some((l) => l.status !== "ok") ? <p className="mt-5 rounded-xl bg-gold-soft px-4 py-3 text-center text-sm font-medium text-gold-ink">⚠ {t.errors.cart_issues}</p>
          : <Link href={`/${locale}/checkout`} className="mt-5 block w-full rounded-xl bg-brand px-5 py-3 text-center font-semibold text-brand-fg transition hover:brightness-110 active:scale-[0.98]">{t.cart.checkout}</Link>}
        <Link href={`/${locale}`} className="mt-4 block text-center text-sm font-medium text-brand hover:underline">{t.cart.continue}</Link>
      </aside>
    </div>
  );
}
