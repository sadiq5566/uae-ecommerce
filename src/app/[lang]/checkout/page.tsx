import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth/session";
import { getProvider } from "@/lib/payments";
import { getAddresses } from "@/features/account/service";
import { getBuyNowView, getCartView } from "@/features/cart/service";
import { CheckoutClient } from "@/features/checkout/checkout-client";
import { availableMethods } from "@/features/checkout/prepare";
import { privatePage } from "@/lib/page-meta";
import { creditSummary } from "@/features/credit/service";
import { getPublicCoupons, getPublicOffers } from "@/features/offers/service";

export const generateMetadata = privatePage((t) => t.checkout.title);

export default async function CheckoutPage({ params, searchParams }: PageProps<"/[lang]/checkout">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const sp = await searchParams;
  const buySku = typeof sp.buy === "string" && sp.buy.length <= 64 ? sp.buy : undefined; // "Buy now": one item, cart untouched
  const buyQty = Number(typeof sp.qty === "string" ? sp.qty : 1) || 1;
  const user = await getCurrentUser(); // guests can check out: no sign-in wall
  const [t, cart, addresses, methods, offers, coupons, credit] = await Promise.all([
    getDictionary(lang), buySku ? getBuyNowView(buySku, buyQty) : getCartView(), user ? getAddresses(user.id) : Promise.resolve([]), availableMethods(), getPublicOffers(), getPublicCoupons(), user ? creditSummary(user.id) : Promise.resolve(null),
  ]);
  const items = cart.lines.filter((l) => l.qty > 0 && l.status === "ok");
  const blocked = items.length === 0 || cart.lines.some((l) => l.status !== "ok");
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="mb-2 font-display text-3xl font-bold">{t.checkout.title}</h1>
      {buySku && <p className="mb-6 text-sm text-muted">{t.checkout.buyNowNote}</p>}
      {!user && (
        <p className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-brand-soft px-4 py-3 text-sm text-brand">
          <span className="font-medium">{t.checkout.guestNote}</span>
          <span className="text-muted">{t.checkout.haveAccount} <Link href={`/${lang}/login?next=${encodeURIComponent(`/${lang}/checkout`)}`} className="font-semibold text-brand hover:underline">{t.checkout.signInLink}</Link></span>
        </p>
      )}
      {blocked ? (
        <div className="grid place-items-center gap-3 rounded-2xl border border-dashed border-line py-20 text-center">
          <p className="text-5xl">🛒</p><h2 className="font-display text-xl font-bold">{t.checkout.emptyCart}</h2>
          <Link href={`/${lang}/cart`} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-fg">{t.checkout.cartLink}</Link>
        </div>
      ) : (
        <CheckoutClient
          key={addresses.map((a) => a.id).join() + (buySku ?? "")} locale={lang} t={t} addresses={addresses} methods={methods as never} testMode={!!getProvider()?.testOnly}
          guest={!user} buy={buySku ? { sku: buySku, qty: items[0]?.qty ?? 1 } : undefined} offers={offers} coupons={coupons} defaultName={user?.name} defaultPhone={user?.phone}
          credit={credit && credit.balanceFils > 0 ? { balance: credit.balance, expiresAt: credit.nextExpiry?.toISOString() } : undefined}
          items={items.map((l) => ({ sku: l.sku, name: l.name[lang], variant: l.variantLabel?.[lang], qty: l.qty, icon: l.icon, hue: l.hue, image: l.image, unitPrice: l.unitPrice, listPrice: l.listPrice, lineTotal: l.lineTotal }))}
        />
      )}
    </div>
  );
}
