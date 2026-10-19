import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { fmt } from "@/lib/format";
import { formatAED, isLocale } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth/session";
import { getProvider } from "@/lib/payments";
import { getPayableClientSecret, publishableKey as stripePublishableKey } from "@/lib/payments/stripe";
import { getOrderByToken, getOrderForUser } from "@/features/orders/queries";
import { StripeEmbedded } from "@/features/orders/stripe-embedded";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Card payment on our own page (Stripe Payment Element, styled to the store). Card details go straight to Stripe, never through this app. */
export default async function CardPayPage({ params, searchParams }: PageProps<"/[lang]/pay/card/[number]">) {
  const { lang, number } = await params;
  const { k } = await searchParams;
  const token = typeof k === "string" ? k : "";
  const publishableKey = stripePublishableKey();
  if (!isLocale(lang) || getProvider()?.id !== "stripe" || !publishableKey) notFound();
  const user = await getCurrentUser();
  const o = user ? await getOrderForUser(number, user.id) : token ? await getOrderByToken(number, token) : null;
  if (!o) notFound();
  const back = o.guest ? `/${lang}/track/${number}?k=${token}` : `/${lang}/account/orders/${number}`;
  if (o.status !== "pending_payment" || !o.payment.providerRef) redirect(back);
  const clientSecret = await getPayableClientSecret(o.payment.providerRef);
  if (!clientSecret) redirect(back); // already paid or cancelled; the order page offers "Complete payment" if needed
  const [t, h] = await Promise.all([getDictionary(lang), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = process.env.NEXT_PUBLIC_SITE_URL && process.env.NODE_ENV === "production" ? process.env.NEXT_PUBLIC_SITE_URL : `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
  const total = formatAED(o.totals.total, lang);
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <section className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8" aria-labelledby="card-h">
        <p className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">🔒 {t.pay.secureTitle}</p>
        <h1 id="card-h" className="mt-4 font-display text-3xl font-bold">{total}</h1>
        <p className="mb-6 mt-1 text-sm text-muted" dir="ltr">{o.orderNumber}</p>
        <StripeEmbedded
          publishableKey={publishableKey} clientSecret={clientSecret} returnUrl={`${origin}${back}`} locale={lang}
          labels={{ pay: fmt(t.pay.payNow, { amount: total }), processing: t.pay.processing, secure: t.pay.secureNote, failed: t.pay.failed }}
        />
        <Link href={back} className="mt-5 block text-center text-sm text-muted hover:text-brand">← {t.pay.backToOrder}</Link>
      </section>
      <aside className="h-fit rounded-3xl border border-line bg-surface-2 p-6" aria-label={t.pay.summary}>
        <h2 className="font-display text-lg font-bold">{t.pay.summary}</h2>
        <ul className="mt-4 flex flex-col gap-3 text-sm">
          {o.items.map((i) => (
            <li key={i.sku} className="flex justify-between gap-3">
              <span className="min-w-0"><span className="line-clamp-2">{i.name[lang]}</span><span className="text-xs text-muted">{fmt(t.orders.qty, { n: i.qty })}</span></span>
              <span className="shrink-0 font-medium">{formatAED(i.lineTotal, lang)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4"><span className="font-semibold">{t.checkout.total}</span><span className="text-xl font-bold">{total}</span></div>
      </aside>
    </div>
  );
}
