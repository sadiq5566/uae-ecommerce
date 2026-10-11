import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { requireUser } from "@/lib/auth/guard";
import { getProvider } from "@/lib/payments";
import { getAddresses } from "@/features/account/service";
import { getCartView } from "@/features/cart/service";
import { CheckoutClient } from "@/features/checkout/checkout-client";
import { availableMethods } from "@/features/checkout/prepare";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CheckoutPage({ params }: PageProps<"/[lang]/checkout">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const user = await requireUser(lang, `/${lang}/checkout`);
  const [t, cart, addresses, methods] = await Promise.all([getDictionary(lang), getCartView(), getAddresses(user.id), availableMethods()]);
  const items = cart.lines.filter((l) => l.qty > 0 && l.status === "ok");
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="mb-8 font-display text-3xl font-bold">{t.checkout.title}</h1>
      {items.length === 0 || cart.hasIssues && cart.lines.some((l) => l.status !== "ok") ? (
        <div className="grid place-items-center gap-3 rounded-2xl border border-dashed border-line py-20 text-center">
          <p className="text-5xl">🛒</p><h2 className="font-display text-xl font-bold">{t.checkout.emptyCart}</h2>
          <Link href={`/${lang}/cart`} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-fg">{t.checkout.cartLink}</Link>
        </div>
      ) : (
        <CheckoutClient key={addresses.map((a) => a.id).join()} locale={lang} t={t} addresses={addresses} methods={methods as never} testMode={!!getProvider()?.testOnly}
          items={items.map((l) => ({ sku: l.sku, name: l.name[lang], variant: l.variantLabel?.[lang], qty: l.qty, icon: l.icon, hue: l.hue, lineTotal: l.lineTotal }))} />
      )}
    </div>
  );
}
