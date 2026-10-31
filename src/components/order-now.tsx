"use client";
import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import { getQuickOrderAction } from "@/features/cart/drawer-actions";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/i18n";
import { useToast } from "./toast";

// The order popup is only fetched when someone actually orders.
const QuickOrder = dynamic(() => import("@/features/cart/quick-order").then((m) => m.QuickOrder), { ssr: false });
type Loaded = NonNullable<Awaited<ReturnType<typeof getQuickOrderAction>>> & { buy: { sku: string; qty: number } };

/** "Order now": opens the one-screen order popup for a single product (the cart is left alone). */
export function OrderNow({ sku, qty = 1, locale, t, className, disabled }: { sku: string; qty?: number; locale: Locale; t: Dictionary; className?: string; disabled?: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<Loaded | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" disabled={disabled || pending} aria-busy={pending}
        onClick={() => start(async () => {
          const r = await getQuickOrderAction(sku, qty).catch(() => null);
          // buy is built once: a new object each render would re-quote forever
          if (r) setData({ ...r, buy: { sku: r.cart.lines[0].sku, qty: r.cart.lines[0].qty } });
          else toast(t.errors.out_of_stock ?? t.errors.generic, "error");
        })}
        className={className}>
        {pending ? <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent align-middle" aria-hidden /> : <><span aria-hidden className="hidden @[13rem]:inline">⚡ </span>{t.cart.orderNow}</>}
      </button>
      {data && <QuickOrder locale={locale} t={t} cart={data.cart} quick={data.quick} buy={data.buy} onClose={() => setData(null)} />}
    </>
  );
}
