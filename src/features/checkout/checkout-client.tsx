"use client";
import Image from "@/components/img";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { refreshSession } from "@/components/session-store";
import { SubmitButton, inputCls } from "@/components/form-ui";
import type { Dictionary } from "@/lib/dictionaries";
import { fmt } from "@/lib/format";
import { formatAED, type Locale } from "@/lib/i18n";
import { AddressForm } from "@/features/account/address-form";
import { EMIRATES } from "@/lib/emirates";
import type { PublicOffers } from "@/features/offers/shared";
import type { PublicCoupon } from "@/features/offers/service";
import type { AddressView } from "@/features/account/service";
import { placeOrderAction, quoteAction, type PlaceState, type Quote } from "./actions";
import { rememberCartEmailAction } from "@/features/growth/actions";

type Method = "card" | "apple_pay" | "google_pay" | "tabby" | "cod";
type Item = { sku: string; name: string; variant?: string; qty: number; icon: string; hue: number; image?: string; unitPrice: number; listPrice: number; lineTotal: number };

type Guest = Record<"recipientName" | "phone" | "email" | "emirate" | "area" | "street" | "building" | "unit" | "landmark" | "instructions", string>;

export function CheckoutClient({ locale, t, addresses, methods, items, testMode, guest, buy, offers, coupons = [], defaultName, defaultPhone, credit }: {
  locale: Locale; t: Dictionary; addresses: AddressView[]; methods: Method[]; items: Item[]; testMode: boolean;
  guest: boolean; buy?: { sku: string; qty: number }; offers: PublicOffers; coupons?: PublicCoupon[]; defaultName?: string; defaultPhone?: string;
  /** Signed-in customer's spendable web credit (AED) and when the soonest lot expires. */
  credit?: { balance: number; expiresAt?: string };
}) {
  // No saved addresses to pick from (guests, or members who have none): type the delivery details right here.
  const inline = guest || addresses.length === 0;
  const [g, setG] = useState<Guest>({ recipientName: defaultName ?? "", phone: defaultPhone ?? "", email: "", emirate: "", area: "", street: "", building: "", unit: "", landmark: "", instructions: "" });
  const set = (k: keyof Guest) => (e: { target: { value: string } }) => setG((x) => ({ ...x, [k]: e.target.value }));
  const [dPhone, setDPhone] = useState(""); const [dEmail, setDEmail] = useState("");
  useEffect(() => { const id = setTimeout(() => { setDPhone(g.phone); setDEmail(g.email); }, 500); return () => clearTimeout(id); }, [g.phone, g.email]);
  const router = useRouter();
  // Guests: remember the typed email so an abandoned bag can be followed up (once, after an hour).
  useEffect(() => { if (guest && /^\S+@\S+\.\S+$/.test(dEmail)) void rememberCartEmailAction(dEmail, locale); }, [guest, dEmail, locale]);
  // One key per mounted checkout: re-submitting this form can never create a second order.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [addressId, setAddressId] = useState(addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "");
  const [method, setMethod] = useState<Method | "">(methods[0] ?? "");
  const [coupon, setCoupon] = useState("");
  const [applied, setApplied] = useState("");
  const [couponError, setCouponError] = useState<string>();
  const [useCredit, setUseCredit] = useState(true); // "use web credit first" is on by default whenever there is a balance
  const [quote, setQuote] = useState<Quote | null>(null);
  const [adding, setAdding] = useState(false);
  const [quoting, startQuote] = useTransition();
  const [state, action, placing] = useActionState<PlaceState, FormData>(placeOrderAction, {});
  const seq = useRef(0);
  const er: Record<string, string> = t.errors;

  const requote = useCallback((a: string, m: string, c: string, extra: { emirate?: string; phone?: string; email?: string }) => {
    const id = ++seq.current;
    startQuote(async () => {
      const q = await quoteAction({ addressId: a || undefined, method: m, couponCode: c || undefined, useCredit: !!credit && useCredit, buy, ...extra });
      if (id !== seq.current) return; // ignore out-of-order responses
      setQuote(q);
      if (!q.ok && c && q.error.startsWith("coupon")) { setCouponError(q.error); setApplied(""); }
    });
  }, [buy, credit, useCredit]);
  useEffect(() => {
    if (!method) return;
    if (inline) { if (g.emirate) requote("", method, applied, { emirate: g.emirate, phone: dPhone, email: dEmail }); }
    else if (addressId) requote(addressId, method, applied, {});
  }, [addressId, method, applied, requote, inline, g.emirate, dPhone, dEmail]);

  // The server may have cleared the cart on success; keep the header badge honest.
  useEffect(() => { if (state.total !== undefined) router.refresh(); }, [state.total, router]);
  useEffect(() => () => { refreshSession(); }, []); // re-read the real count (online payments keep the cart until paid)

  const err = (code?: string) => (code ? fmt(er[code] ?? er.generic, { min: "" }) : undefined);
  const q = quote?.ok ? quote : null;
  const fe = state.fieldErrors ?? {};
  const gf = (k: keyof Guest, label: string, opts: { type?: string; required?: boolean; auto?: string; ph?: string; span?: boolean; hint?: string } = {}) => (
    <div className={opts.span ? "sm:col-span-2" : ""}>
      <label htmlFor={`g-${k}`} className="mb-1.5 block text-sm font-medium">{label}</label>
      <input id={`g-${k}`} name={k} form="checkout-form" type={opts.type ?? "text"} value={g[k]} onChange={set(k)} required={opts.required} autoComplete={opts.auto} placeholder={opts.ph} maxLength={k === "instructions" ? 300 : 150}
        aria-invalid={!!fe[k]} aria-describedby={fe[k] ? `g-${k}-err` : opts.hint ? `g-${k}-hint` : undefined} className={inputCls} />
      {fe[k] ? <p id={`g-${k}-err`} role="alert" className="mt-1.5 text-sm text-danger">{er[fe[k]] ?? er.generic}</p> : opts.hint ? <p id={`g-${k}-hint`} className="mt-1.5 text-xs text-muted">{opts.hint}</p> : null}
    </div>
  );
  // Public coupons with a rough saving on the current items; the server re-checks every rule when the code is applied.
  const itemsTotal = items.reduce((a, i) => a + i.lineTotal, 0);
  const itemCount = items.reduce((a, i) => a + i.qty, 0);
  const offerCards = coupons.map((c) => {
    // Same rule as the server: a coupon skips items that are already on sale unless the admin allowed stacking.
    const base = items.filter((i) => c.stackWithSale || i.unitPrice >= i.listPrice).reduce((a, i) => a + i.lineTotal, 0);
    const raw = c.type === "percent" ? (base * c.value) / 100 : c.value;
    const est = Math.round(Math.min(raw, c.maxDiscount ?? Infinity, base) * 100) / 100;
    return { c, est, base, eligible: base > 0 && base >= c.minSubtotal, saleOnly: base === 0 && itemsTotal > 0 };
  }).map((o, _, all) => ({ ...o, best: o.eligible && o.est > 0 && o.est === Math.max(...all.filter((x) => x.eligible).map((x) => x.est)) }))
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.est - a.est);
  const estApplied = offerCards.find((o) => o.c.code === applied);
  // Only one discount applies per order (the larger). Compare each code with the automatic offer already on this order.
  const autoBest = q?.autoBest ?? 0;
  const autoLabel = q?.autoBestOffer ? (q.autoBestOffer.kind === "first_order" ? fmt(t.checkout.offerFirst, { pct: q.autoBestOffer.percent ?? offers.firstOrder.pct }) : fmt(t.checkout.offerTier, { pct: q.autoBestOffer.percent ?? offers.tier.pct, min: formatAED(offers.tier.min, locale) })) : "";
  const gainOf = (o: (typeof offerCards)[number]) => (o.eligible ? Math.max(0, o.est - autoBest) : 0);
  const topGain = Math.max(0, ...offerCards.map(gainOf));
  const recommended = offerCards.find((o) => o.eligible && gainOf(o) > 0 && gainOf(o) === topGain);
  const otherOffers = offerCards.filter((o) => o !== recommended);
  const fdate = new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", { day: "numeric", month: "short", year: "numeric" });
  const renderOffer = ({ c, est, base, eligible, saleOnly }: (typeof offerCards)[number], featured: boolean) => (
    <li key={c.code} className={`rounded-xl border p-3 ${applied === c.code ? "border-brand bg-brand-soft" : featured ? "border-2 border-brand bg-surface" : "border-dashed border-line bg-surface"} ${eligible ? "" : "opacity-75"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            <span className="text-base">{c.type === "percent" ? fmt(t.checkout.offerPercent, { n: c.value }) : fmt(t.checkout.offerAmount, { amount: formatAED(c.value, locale) })}</span>
            <code dir="ltr" className="rounded bg-surface-2 px-2 py-0.5 font-mono text-xs tracking-wider">{c.code}</code>
          </p>
          {c.description?.[locale] && <p className="mt-0.5 text-sm">{c.description[locale]}</p>}
        </div>
        <button type="button" disabled={!eligible || applied === c.code} onClick={() => { setCoupon(c.code); setCouponError(undefined); setApplied(c.code); }}
          className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-brand-fg transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted">
          {applied === c.code ? (quoting ? "…" : `✓ ${t.checkout.offerApplied}`) : t.checkout.couponApply}
        </button>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <li>{eligible ? (est > 0 ? (autoBest > 0 && est <= autoBest ? <b className="text-gold-ink">{fmt(t.checkout.offerNoGain, { auto: autoLabel, amount: formatAED(autoBest, locale) })}</b> : <b className="text-brand">{autoBest > 0 ? fmt(t.checkout.offerExtra, { amount: formatAED(est - autoBest, locale), total: formatAED(est, locale) }) : fmt(t.checkout.offerSave, { amount: formatAED(est, locale) })}</b>) : null) : <b className="text-gold-ink">{saleOnly ? t.checkout.offerNoSale : fmt(t.checkout.offerUnlock, { amount: formatAED(c.minSubtotal - base, locale) })}</b>}</li>
        <li>{c.minSubtotal > 0 ? fmt(t.checkout.offerMin, { amount: formatAED(c.minSubtotal, locale) }) : t.checkout.offerNoMin}</li>
        {c.type === "percent" && c.maxDiscount ? <li>{fmt(t.checkout.offerMax, { amount: formatAED(c.maxDiscount, locale) })}</li> : null}
        {c.endsAt && <li>{fmt(t.checkout.offerUntil, { d: fdate.format(new Date(c.endsAt)) })}</li>}
      </ul>
    </li>
  );
  const quoteErr = quote && !quote.ok && !quote.error.startsWith("coupon") ? quote.error : undefined;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="flex flex-col gap-8">
        {inline ? (
          <section aria-labelledby="addr-h">
            <h2 id="addr-h" className="mb-3 font-display text-xl font-bold">{guest ? t.checkout.contact : t.checkout.deliverTo}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {gf("recipientName", t.address.recipient, { required: true, auto: "name" })}
              {gf("phone", t.address.phone, { type: "tel", required: true, auto: "tel", ph: "050 123 4567" })}
              {guest && gf("email", t.checkout.email, { type: "email", auto: "email", span: true, required: method === "tabby", hint: t.checkout.emailHint })}
              <div>
                <label htmlFor="g-emirate" className="mb-1.5 block text-sm font-medium">{t.address.emirate}</label>
                <select id="g-emirate" name="emirate" form="checkout-form" value={g.emirate} onChange={set("emirate")} required aria-invalid={!!fe.emirate} className={inputCls}>
                  <option value="" disabled>{t.address.select}</option>
                  {EMIRATES.map((x) => <option key={x} value={x}>{t.address.emirates[x]}</option>)}
                </select>
                {fe.emirate && <p role="alert" className="mt-1.5 text-sm text-danger">{er[fe.emirate] ?? er.generic}</p>}
              </div>
              {gf("area", t.address.area, { required: true })}
              {gf("building", t.address.building, { required: true })}
              <details className="sm:col-span-2" open={!!(fe.street || fe.unit || fe.landmark || fe.instructions)}>
                <summary className="cursor-pointer text-sm font-semibold text-brand">+ {t.checkout.moreDetails}</summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {gf("street", t.address.street)}
                  {gf("unit", t.address.unit)}
                  {gf("landmark", t.address.landmark)}
                  {gf("instructions", t.address.instructions, { span: true })}
                </div>
              </details>
            </div>
          </section>
        ) : (
        <section aria-labelledby="addr-h">
          <h2 id="addr-h" className="mb-3 font-display text-xl font-bold">{t.checkout.deliverTo}</h2>
          <div role="radiogroup" aria-labelledby="addr-h" className="grid gap-3 sm:grid-cols-2">
            {addresses.map((a) => (
              <label key={a.id} className={`cursor-pointer rounded-2xl border p-4 text-sm transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${addressId === a.id ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-brand"}`}>
                <input type="radio" name="address-choice" className="sr-only" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                <span className="font-semibold">{a.label || a.recipientName}</span>
                {a.isDefault && <span className="ms-2 rounded-full bg-brand px-2 py-0.5 text-xs text-brand-fg">{t.address.default}</span>}
                <span className="mt-1 block text-muted">{[a.unit, a.building, a.street, a.area].filter(Boolean).join(", ")}, {t.address.emirates[a.emirate as keyof typeof t.address.emirates]}</span>
                <span className="block text-muted" dir="ltr">{a.phone}</span>
              </label>
            ))}
          </div>
          {adding ? (
            <div className="mt-4 rounded-2xl border border-line bg-surface p-5"><AddressForm t={t} onDone={() => { setAdding(false); router.refresh(); }} /></div>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="mt-3 text-sm font-semibold text-brand hover:underline">+ {t.checkout.addAddress}</button>
          )}
        </section>
        )}

        {credit && credit.balance > 0 && (
          <section aria-labelledby="cr-h" className="rounded-2xl border border-brand/40 bg-brand-soft p-4">
            <label className="flex cursor-pointer items-start gap-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand">
              <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} className="mt-1 size-4 accent-[var(--brand)]" />
              <span>
                <span id="cr-h" className="block font-display text-lg font-bold">💳 {t.credit.useFirst}</span>
                <span className="block text-sm text-brand">{fmt(t.credit.available, { amount: formatAED(credit.balance, locale) })}{credit.expiresAt ? ` · ${fmt(t.credit.validUntil, { d: fdate.format(new Date(credit.expiresAt)) })}` : ""}</span>
                {useCredit && q && q.creditApplied > 0 && <span className="mt-1 block text-sm font-semibold">{fmt(t.credit.applying, { amount: formatAED(q.creditApplied, locale) })}</span>}
              </span>
            </label>
          </section>
        )}

        {q?.creditCovers ? (
          <section aria-labelledby="pay-h">
            <h2 id="pay-h" className="mb-3 font-display text-xl font-bold">{t.checkout.payment}</h2>
            <p role="status" className="rounded-2xl border border-brand bg-brand-soft p-4 text-sm font-medium text-brand">✓ {t.credit.covers}</p>
          </section>
        ) : (
        <section aria-labelledby="pay-h">
          <h2 id="pay-h" className="mb-3 font-display text-xl font-bold">{t.checkout.payment}</h2>
          {methods.length === 0 ? <p role="alert" className="text-sm text-danger">{t.checkout.noMethods}</p> : (
            <div role="radiogroup" aria-labelledby="pay-h" className="grid gap-3">
              {methods.map((m) => (
                <label key={m} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${method === m ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-brand"}`}>
                  <input type="radio" name="method-choice" className="size-4 accent-[var(--brand)]" checked={method === m} onChange={() => setMethod(m)} />
                  <span><span className="block font-semibold">{t.checkout.methods[m]}</span><span className="block text-sm text-muted">{t.checkout.methodNotes[m]}</span></span>
                </label>
              ))}
            </div>
          )}
          {method && method !== "cod" && !q?.creditCovers && <p className="mt-3 text-xs text-muted">🔒 {t.checkout.secureNote}</p>}
          {testMode && method && method !== "cod" && <p className="mt-2 inline-block rounded-full bg-gold-soft px-3 py-1 text-xs font-bold text-gold-ink">⚠ {t.checkout.testMode}</p>}
        </section>
        )}

        <details aria-labelledby="cp-h" open={!!applied || coupons.length > 0}>
          <summary id="cp-h" className="cursor-pointer font-display text-xl font-bold">{t.checkout.coupon}</summary>
          <div className="mt-3">
          {applied ? (
            <p className="flex items-center justify-between rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">
              <span>✓ {fmt(t.checkout.couponApplied, { code: applied })}</span>
              <button type="button" onClick={() => { setApplied(""); setCoupon(""); setCouponError(undefined); }} className="font-semibold hover:underline">{t.checkout.couponRemove}</button>
            </p>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); setCouponError(undefined); if (coupon.trim()) setApplied(coupon.trim().toUpperCase()); }} className="flex gap-2">
              <input value={coupon} onChange={(e) => setCoupon(e.target.value)} maxLength={30} aria-label={t.checkout.coupon} aria-invalid={!!couponError} className={inputCls} autoCapitalize="characters" />
              <button className="rounded-xl border border-brand px-5 text-sm font-semibold text-brand transition hover:bg-brand-soft">{t.checkout.couponApply}</button>
            </form>
          )}
          {couponError && <p role="alert" className="mt-2 text-sm text-danger">{er[couponError] ?? er.generic}</p>}
          {coupons.length > 0 && (
            <div className="mt-4 flex flex-col gap-4">
              {recommended && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">⭐ {t.checkout.offerRecommended}</h3>
                  <ul className="grid gap-2">{renderOffer(recommended, true)}</ul>
                </div>
              )}
              {otherOffers.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">🏷️ {t.checkout.availableOffers}</h3>
                  <ul className="grid gap-2">{otherOffers.map((o) => renderOffer(o, false))}</ul>
                </div>
              )}
            </div>
          )}
          </div>
        </details>
      </div>

      <aside className="h-fit rounded-2xl border border-line bg-surface p-6 lg:sticky lg:top-32" aria-label={t.checkout.summary}>
        <h2 className="font-display text-xl font-bold">{t.checkout.summary} <span className="text-sm font-normal text-muted">({fmt(t.checkout.itemCount, { n: itemCount })})</span></h2>
        <ul className="mt-4 flex max-h-80 flex-col gap-4 overflow-y-auto text-sm">
          {items.map((i) => (
            <li key={i.sku} className="flex items-start gap-3">
              <span className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-line text-2xl" style={{ background: `hsl(${i.hue} 70% 94%)` }} aria-hidden>
                {i.image ? <Image src={i.image} alt="" fill sizes="64px" className="object-cover" /> : i.icon}
                {i.qty > 1 && <span className="absolute end-0 top-0 rounded-es-lg bg-brand px-1.5 py-0.5 text-[10px] font-bold text-brand-fg">×{i.qty}</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 font-medium leading-snug">{i.name}</span>
                {i.variant && <span className="mt-1 inline-block rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{t.checkout.option}: <b className="font-semibold text-fg">{i.variant}</b></span>}
                <span className="mt-1 block text-xs text-muted">{fmt(t.orders.qty, { n: i.qty })} × {formatAED(i.unitPrice, locale)}{i.listPrice > i.unitPrice && <> <s>{formatAED(i.listPrice, locale)}</s></>}</span>
              </span>
              <span className="shrink-0 font-semibold">{formatAED(i.lineTotal, locale)}</span>
            </li>
          ))}
        </ul>
        <div className={`mt-5 border-t border-line pt-4 text-sm transition-opacity ${quoting ? "opacity-50" : ""}`} aria-busy={quoting}>
          {q ? (
            <>
              <dl className="flex flex-col gap-2">
                <Row label={t.checkout.subtotal} value={formatAED(q.subtotal, locale)} />
                {q.couponDiscount > 0 && <Row label={`${t.checkout.couponLine}${q.couponCode ? ` (${q.couponCode})` : ""}`} value={`−${formatAED(q.couponDiscount, locale)}`} accent />}
                {q.offerDiscount > 0 && q.offer && <Row label={q.offer.kind === "first_order" ? fmt(t.checkout.offerFirst, { pct: q.offer.percent ?? offers.firstOrder.pct }) : fmt(t.checkout.offerTier, { pct: q.offer.percent ?? offers.tier.pct, min: formatAED(offers.tier.min, locale) })} value={`−${formatAED(q.offerDiscount, locale)}`} accent />}
                <Row label={`${t.checkout.delivery} · ${q.zoneName[locale]}`} value={q.deliveryFee === 0 ? t.checkout.free : formatAED(q.deliveryFee, locale)} accent={q.deliveryFee === 0} />
                {q.codFee > 0 && <Row label={t.checkout.codFee} value={formatAED(q.codFee, locale)} />}
                {q.tax > 0 && <Row label={q.taxIncluded ? t.checkout.taxIncl : t.checkout.tax} value={formatAED(q.tax, locale)} muted />}
                {q.creditApplied > 0 && <Row label={t.credit.line} value={`−${formatAED(q.creditApplied, locale)}`} accent />}
                <div className="mt-2 flex items-baseline justify-between border-t border-line pt-3"><dt className="font-semibold">{t.checkout.total}</dt><dd className="text-2xl font-bold">{formatAED(q.total, locale)}</dd></div>
              </dl>
              {q.deliveryFee > 0 && offers.freeDelivery.enabled && q.discountedSubtotal < offers.freeDelivery.min && <p className="mt-2 text-xs font-medium text-brand">🚚 {fmt(t.offers.progressFree, { amount: formatAED(offers.freeDelivery.min - q.discountedSubtotal, locale) })}</p>}
              <p className="mt-2 text-xs text-muted">🚚 {fmt(t.checkout.estimate, { text: q.estimate[locale] })}</p>
              {applied && q.offer?.kind === "coupon" && q.autoBest > 0 && q.autoBest >= q.couponDiscount && <p role="status" className="mt-2 rounded-lg bg-gold-soft px-3 py-2 text-xs font-medium text-gold-ink">{fmt(t.checkout.couponTie, { amount: formatAED(q.autoBest, locale) })}</p>}
              {q.couponBeaten && <p role="status" className="mt-2 rounded-lg bg-gold-soft px-3 py-2 text-xs font-medium text-gold-ink">{t.checkout.couponBeaten}</p>}
              {q.couponDiscount + q.offerDiscount > 0 && <p className="mt-2 text-xs font-semibold text-brand">🎉 {fmt(t.checkout.savedWith, { amount: formatAED(q.couponDiscount + q.offerDiscount, locale) })}</p>}
            </>
          ) : quoteErr ? <p role="alert" className="text-sm text-danger">{quoteErr === "below_minimum" ? fmt(er.below_minimum, {}) : er[quoteErr] ?? er.generic}</p>
            : inline && !g.emirate ? (
              <>
                <dl className="flex flex-col gap-2">
                  <Row label={t.checkout.subtotal} value={formatAED(itemsTotal, locale)} />
                  {estApplied && estApplied.est > 0 && estApplied.eligible && <Row label={`${t.checkout.couponLine} (${estApplied.c.code})`} value={`−${formatAED(estApplied.est, locale)}`} accent />}
                  <Row label={t.checkout.delivery} value={offers.freeDelivery.enabled && itemsTotal >= offers.freeDelivery.min ? t.checkout.free : t.checkout.pickEmirateShort} accent={offers.freeDelivery.enabled && itemsTotal >= offers.freeDelivery.min} />
                </dl>
                {offers.freeDelivery.enabled && itemsTotal < offers.freeDelivery.min && <p className="mt-2 text-xs font-medium text-brand">🚚 {fmt(t.offers.progressFree, { amount: formatAED(offers.freeDelivery.min - itemsTotal, locale) })}</p>}
                {estApplied && estApplied.est > 0 && estApplied.eligible && <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2"><dt className="text-sm font-semibold">{t.checkout.estTotal}</dt><dd className="text-xl font-bold">{formatAED(itemsTotal - estApplied.est, locale)}</dd></div>}
                <p className="mt-2 text-xs text-muted">{t.checkout.pickEmirate}</p>
              </>
            )
            : <div className="skeleton h-24 rounded-xl" aria-hidden />}
        </div>

        <form id="checkout-form" action={action} className="mt-5 flex flex-col gap-3">
          {buy && <><input type="hidden" name="buySku" value={buy.sku} /><input type="hidden" name="buyQty" value={buy.qty} /></>}
          <input type="hidden" name="locale" value={locale} /><input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          {!inline && <input type="hidden" name="addressId" value={addressId} />}<input type="hidden" name="method" value={method} />
          <input type="hidden" name="useCredit" value={credit && useCredit ? "1" : "0"} /><input type="hidden" name="couponCode" value={applied} /><input type="hidden" name="expectedTotal" value={q?.total ?? ""} />
          {state.error && (
            <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
              {er[state.error] ?? er.generic}{state.total !== undefined && <> {fmt(t.checkout.updatedTotal, { total: formatAED(state.total, locale) })}</>}
              {(state.error === "cart_issues" || state.error === "out_of_stock") && <> <Link href={`/${locale}/cart`} className="font-semibold underline">{t.checkout.cartLink}</Link></>}
            </p>
          )}
          <SubmitButton pending={placing}>{!q || !method ? t.checkout.place : method === "cod" || q.creditCovers ? t.checkout.place : t.checkout.placeCard}</SubmitButton>
          <Link href={`/${locale}/cart`} className="text-center text-sm text-muted hover:text-brand">{t.checkout.cartLink}</Link>
        </form>
        {(!q || (!addressId && !inline) || !method) && <p className="sr-only">{err(state.error)}</p>}
      </aside>
    </div>
  );
}

function Row({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return <div className={`flex justify-between gap-4 ${muted ? "text-muted" : ""}`}><dt>{label}</dt><dd className={accent ? "font-semibold text-brand" : "font-medium"}>{value}</dd></div>;
}
