"use client";
import Image from "@/components/img";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { setCartCount } from "@/components/session-store";
import { useToast } from "@/components/toast";
import type { Dictionary } from "@/lib/dictionaries";
import { fmt } from "@/lib/format";
import { formatAED, type Locale } from "@/lib/i18n";
import { OfferProgress } from "@/features/offers/progress";
import { removeFromCartAction, setQtyAction } from "./actions";
import { getCartDrawerAction, getCartOnlyAction, type DrawerData } from "./drawer-actions";
import { QuickOrder } from "./quick-order";
import type { CartLine } from "./service";

/** Slide-out cart (opens from the right, or the left in Arabic). Edit quantities, go to checkout, or order in one popup. */
export default function CartDrawer({ open, onClose, locale, t }: { open: boolean; onClose: () => void; locale: Locale; t: Dictionary }) {
  const ref = useRef<HTMLDialogElement>(null);
  const toast = useToast();
  const [data, setData] = useState<DrawerData | null>(null);
  const [failed, setFailed] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [pending, start] = useTransition();

  const load = useCallback(() => {
    setFailed(false);
    getCartDrawerAction().then((d) => { setData(d); setCartCount(d.cart.itemCount); }).catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) { d.showModal(); load(); }
    if (!open && d.open) d.close();
  }, [open, load]);

  const run = (fn: () => ReturnType<typeof setQtyAction>) => start(async () => {
    const r = await fn();
    setCartCount(r.count);
    if (!r.ok) toast(t.errors[r.error ?? "generic"] ?? t.errors.generic, "error");
    const cart = await getCartOnlyAction();
    setData((d) => (d ? { ...d, cart } : d));
  });
  const note = (l: CartLine) => {
    if (l.status === "unavailable") return t.cart.unavailable;
    if (l.status === "out_of_stock") return t.cart.outOfStock;
    if (l.status === "reduced") return fmt(t.cart.reduced, { n: l.stock });
    if (l.priceChanged) return fmt(t.cart.priceChanged, { old: formatAED(l.priceAtAdd, locale) });
    return null;
  };

  const cart = data?.cart;
  const lines = cart?.lines ?? [];
  const blocked = lines.some((l) => l.status !== "ok");

  return (
    <>
      <dialog ref={ref} aria-label={t.cart.title} onClose={() => { setOrdering(false); onClose(); }} onClick={(e) => e.target === ref.current && ref.current?.close()}
        className="m-0 ms-auto h-dvh max-h-none w-[min(100vw,26rem)] max-w-none overflow-hidden bg-surface p-0 text-fg backdrop:bg-black/50 backdrop:backdrop-blur-sm open:flex open:flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-xl font-bold">🛒 {t.cart.title}{cart && cart.itemCount > 0 && <span className="ms-2 text-sm font-normal text-muted">({fmt(t.cart.items, { n: cart.itemCount })})</span>}</h2>
          <button onClick={() => ref.current?.close()} aria-label={t.nav.close} className="grid size-9 place-items-center rounded-full hover:bg-surface-2">✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" aria-busy={pending || (!data && !failed)}>
          {failed ? (
            <div className="grid place-items-center gap-3 py-16 text-center text-sm">
              <p className="text-danger">{t.errors.generic}</p>
              <button onClick={load} className="rounded-full border border-brand px-5 py-2 font-semibold text-brand">↻</button>
            </div>
          ) : !data ? (
            <div className="flex flex-col gap-4" aria-hidden>{[0, 1].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}</div>
          ) : lines.length === 0 ? (
            <div className="grid place-items-center gap-3 py-16 text-center">
              <p className="animate-float text-6xl">🛒</p><h3 className="font-display text-lg font-bold">{t.cart.empty}</h3>
              <p className="text-sm text-muted">{t.cart.emptyHint}</p>
              <button onClick={() => ref.current?.close()} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-fg">{t.cart.continue}</button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <OfferProgress subtotal={cart!.subtotal} offers={data.offers} locale={locale} t={t} />
              <ul className={`flex flex-col gap-3 transition-opacity ${pending ? "opacity-60" : ""}`}>
                {lines.map((l) => {
                  const n = note(l);
                  return (
                    <li key={l.sku} className="flex gap-3 rounded-2xl border border-line p-3">
                      <div className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl text-3xl" style={{ background: `linear-gradient(135deg, hsl(${l.hue} 70% 92%), hsl(${l.hue} 60% 82%))` }} aria-hidden>{l.image ? <Image src={l.image} alt="" fill sizes="80px" className="object-cover" /> : l.icon}</div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          {l.slug ? <Link href={`/${locale}/p/${l.slug}`} onClick={() => ref.current?.close()} className="line-clamp-2 font-medium leading-snug hover:text-brand">{l.name[locale]}</Link> : <p className="font-medium">{l.name[locale]}</p>}
                          <p className="shrink-0 font-bold">{formatAED(l.lineTotal, locale)}</p>
                        </div>
                        {l.variantLabel && <p className="text-xs text-muted">{l.variantLabel[locale]}</p>}
                        {n && <p role="alert" className="text-xs font-medium text-gold-ink">⚠ {n}</p>}
                        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                          {l.stock > 0 ? (
                            <div role="group" aria-label={t.catalog.quantity} className="flex items-center rounded-lg border border-line">
                              <button aria-label="−" disabled={pending} onClick={() => run(() => setQtyAction(l.sku, l.qty - 1))} className="size-8 disabled:opacity-40">−</button>
                              <output className="w-7 text-center text-sm font-semibold tabular-nums">{l.qty}</output>
                              <button aria-label="+" disabled={pending || l.qty >= Math.min(l.stock, 10)} onClick={() => run(() => setQtyAction(l.sku, l.qty + 1))} className="size-8 disabled:opacity-40">+</button>
                            </div>
                          ) : <span />}
                          <button disabled={pending} onClick={() => run(() => removeFromCartAction(l.sku))} className="text-xs text-muted transition hover:text-danger">{t.cart.remove}</button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {data && lines.length > 0 && (
          <div className="border-t border-line bg-surface px-5 py-4">
            <p className="flex items-baseline justify-between"><span className="font-semibold">{t.cart.subtotal}</span><span className="text-2xl font-bold">{formatAED(cart!.subtotal, locale)}</span></p>
            <p className="mt-1 text-xs text-muted">{t.cart.checkoutNote}</p>
            {blocked ? <p className="mt-3 rounded-xl bg-gold-soft px-4 py-3 text-center text-sm font-medium text-gold-ink">⚠ {t.errors.cart_issues}</p> : (
              <div className="mt-3 flex flex-col gap-2">
                <button onClick={() => setOrdering(true)} className="w-full rounded-xl bg-brand px-5 py-3 font-semibold text-brand-fg transition hover:brightness-110 active:scale-[0.98]">⚡ {t.cart.orderNow}</button>
                <Link href={`/${locale}/checkout`} onClick={() => ref.current?.close()} className="block w-full rounded-xl border border-brand px-5 py-3 text-center font-semibold text-brand transition hover:bg-brand-soft active:scale-[0.98]">{t.cart.checkout}</Link>
              </div>
            )}
          </div>
        )}
      </dialog>
      {ordering && data && <QuickOrder locale={locale} t={t} cart={data.cart} quick={data.quick} onClose={() => setOrdering(false)} />}
    </>
  );
}
