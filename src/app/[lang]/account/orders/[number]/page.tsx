import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { formatAED, isLocale } from "@/lib/i18n";
import { fmt } from "@/lib/format";
import { requireUser } from "@/lib/auth/guard";
import { retryPaymentAction } from "@/features/checkout/actions";
import { AutoRefresh } from "@/features/orders/auto-refresh";
import { getOrderForUser } from "@/features/orders/queries";
import { StatusBadge } from "@/features/orders/status-badge";

export const metadata: Metadata = { robots: { index: false, follow: false } };
const STEPS = ["confirmed", "processing", "packed", "out_for_delivery", "delivered"] as const;

export default async function OrderPage({ params, searchParams }: PageProps<"/[lang]/account/orders/[number]">) {
  const { lang, number } = await params;
  if (!isLocale(lang)) notFound();
  const user = await requireUser(lang, `/${lang}/account/orders/${number}`);
  const o = await getOrderForUser(number, user.id);
  if (!o) notFound();
  const sp = await searchParams;
  const t = await getDictionary(lang);
  const fdate = new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-AE", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" });
  const awaiting = o.status === "pending_payment";
  const online = o.payment.method !== "cod";
  const expired = o.status === "cancelled" && online && o.payment.status !== "paid" && o.payment.status !== "refund_pending";
  const stepIdx = STEPS.indexOf(o.status as (typeof STEPS)[number]);
  const cancelled = o.status === "cancelled" || o.status === "refund_pending" || o.status === "refunded";
  const T = o.totals;
  const row = "flex justify-between gap-4 text-sm";

  return (
    <div className="flex flex-col gap-8">
      <AutoRefresh active={awaiting && online && o.payment.status !== "failed"} label={t.orders.refresh} />
      {sp.placed && (
        <div role="status" className="animate-fade-up rounded-2xl bg-brand-soft p-5 text-brand">
          <p className="text-lg font-bold">🎉 {t.orders.thanks}</p>
          {awaiting && online && <p className="mt-1 text-sm">{t.orders.thanksPay}</p>}
        </div>
      )}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold" dir="ltr">{o.orderNumber}</h2>
          <p className="text-sm text-muted">{fmt(t.orders.placedOn, { d: fdate.format(new Date(o.createdAt)) })}</p>
        </div>
        <StatusBadge status={o.status} label={t.orders.status[o.status]} />
      </header>

      {awaiting && online && (
        <div className="rounded-2xl border border-gold/40 bg-gold-soft p-5">
          <p className="text-sm">{t.orders.retryNote}</p>
          <form action={retryPaymentAction} className="mt-3"><input type="hidden" name="locale" value={lang} /><input type="hidden" name="orderNumber" value={o.orderNumber} />
            <button className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-fg transition hover:brightness-110 active:scale-95">{t.orders.retry}</button></form>
        </div>
      )}
      {expired && <p role="alert" className="rounded-2xl bg-danger/10 p-4 text-sm text-danger">{t.orders.expired}</p>}

      {!cancelled && (
        <section aria-label={t.orders.tracking}>
          <h3 className="mb-4 font-semibold">{t.orders.tracking}</h3>
          <ol className="grid grid-cols-5 gap-1 text-center text-[11px] sm:text-xs">
            {STEPS.map((s, i) => (
              <li key={s} className="flex flex-col items-center gap-2" aria-current={i === stepIdx ? "step" : undefined}>
                <span className={`grid size-8 place-items-center rounded-full text-sm font-bold transition ${i <= stepIdx ? "bg-brand text-brand-fg" : "bg-surface-2 text-muted"} ${i === stepIdx ? "ring-4 ring-brand/25" : ""}`}>{i < stepIdx ? "✓" : i + 1}</span>
                <span className={i <= stepIdx ? "font-semibold" : "text-muted"}>{t.orders.status[s]}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted">🚚 {fmt(t.checkout.estimate, { text: o.delivery.estimate[lang] })}</p>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h3 className="mb-3 font-semibold">{t.orders.items}</h3>
          <ul className="flex flex-col gap-3">
            {o.items.map((i) => (
              <li key={i.sku} className="flex items-center gap-3 text-sm">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-xl" aria-hidden>{i.icon ?? "📦"}</span>
                <span className="min-w-0 flex-1"><span className="line-clamp-2">{i.name[lang]}</span><span className="text-xs text-muted">{i.variantLabel ? `${i.variantLabel[lang]} · ` : ""}{fmt(t.orders.qty, { n: i.qty })}</span></span>
                <span className="font-medium">{formatAED(i.lineTotal, lang)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
            <div className={row}><dt>{t.checkout.subtotal}</dt><dd>{formatAED(T.subtotal, lang)}</dd></div>
            {T.couponDiscount > 0 && <div className={row}><dt>{t.checkout.couponLine}{o.coupon ? ` (${o.coupon.code})` : ""}</dt><dd className="text-brand">−{formatAED(T.couponDiscount, lang)}</dd></div>}
            <div className={row}><dt>{t.checkout.delivery}</dt><dd>{T.deliveryFee === 0 ? t.checkout.free : formatAED(T.deliveryFee, lang)}</dd></div>
            {T.codFee > 0 && <div className={row}><dt>{t.checkout.codFee}</dt><dd>{formatAED(T.codFee, lang)}</dd></div>}
            {T.tax > 0 && <div className={`${row} text-muted`}><dt>{T.taxIncluded ? t.checkout.taxIncl : t.checkout.tax}</dt><dd>{formatAED(T.tax, lang)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-3 font-bold"><dt>{t.checkout.total}</dt><dd className="text-lg">{formatAED(T.total, lang)}</dd></div>
          </dl>
        </section>
        <div className="flex flex-col gap-6">
          <section className="rounded-2xl border border-line bg-surface p-5 text-sm">
            <h3 className="mb-2 font-semibold">{t.orders.address}</h3>
            <address className="not-italic leading-relaxed text-muted">
              {o.address.recipientName} · <span dir="ltr">{o.address.phone}</span><br />
              {[o.address.unit, o.address.building, o.address.street, o.address.area].filter(Boolean).join(", ")}<br />
              {t.address.emirates[o.address.emirate as keyof typeof t.address.emirates]}
              {o.address.landmark && <><br />{o.address.landmark}</>}
            </address>
          </section>
          <section className="rounded-2xl border border-line bg-surface p-5 text-sm">
            <h3 className="mb-2 font-semibold">{t.orders.paymentTitle}</h3>
            <p>{t.checkout.methods[o.payment.method]} · <span className="font-medium">{t.orders.payStatus[o.payment.status]}</span></p>
          </section>
          <section className="rounded-2xl border border-line bg-surface p-5 text-sm">
            <h3 className="mb-3 font-semibold">{t.orders.timeline}</h3>
            <ol className="flex flex-col gap-3 border-s border-line ps-4">
              {[...o.timeline].reverse().map((e, i) => (
                <li key={i} className="relative"><span className="absolute -start-[1.4rem] top-1.5 size-2 rounded-full bg-brand" aria-hidden />
                  <p className="font-medium">{t.orders.status[e.status as keyof typeof t.orders.status] ?? e.status}</p><p className="text-xs text-muted">{fdate.format(new Date(e.at))}</p></li>
              ))}
            </ol>
          </section>
        </div>
      </div>
      <Link href={`/${lang}/account/orders`} className="text-sm font-medium text-brand hover:underline">← {t.orders.back}</Link>
    </div>
  );
}
