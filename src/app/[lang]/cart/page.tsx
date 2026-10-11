import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { CartLines } from "@/features/cart/cart-lines";
import { getCartView } from "@/features/cart/service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CartPage({ params }: PageProps<"/[lang]/cart">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const [t, cart] = await Promise.all([getDictionary(lang), getCartView()]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="mb-8 font-display text-3xl font-bold">{t.cart.title}</h1>
      {cart.lines.length === 0 ? (
        <div className="grid place-items-center gap-3 rounded-2xl border border-dashed border-line py-20 text-center">
          <p className="animate-float text-6xl">🛒</p><h2 className="font-display text-xl font-bold">{t.cart.empty}</h2>
          <p className="text-sm text-muted">{t.cart.emptyHint}</p>
          <Link href={`/${lang}`} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-fg">{t.account.startShopping}</Link>
        </div>
      ) : <CartLines cart={cart} locale={lang} t={t} />}
    </div>
  );
}
