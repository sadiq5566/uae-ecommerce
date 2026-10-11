"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { setCartCount } from "@/components/session-store";
import { SubmitButton, inputCls } from "@/components/form-ui";
import type { Dictionary } from "@/lib/dictionaries";
import { fmt } from "@/lib/format";
import { formatAED, type Locale } from "@/lib/i18n";
import { AddressForm } from "@/features/account/address-form";
import type { AddressView } from "@/features/account/service";
import { placeOrderAction, quoteAction, type PlaceState, type Quote } from "./actions";

type Method = "card" | "apple_pay" | "google_pay" | "cod";
type Item = { sku: string; name: string; variant?: string; qty: number; icon: string; hue: number; lineTotal: number };

export function CheckoutClient({ locale, t, addresses, methods, items, testMode }: {
  locale: Locale; t: Dictionary; addresses: AddressView[]; methods: Method[]; items: Item[]; testMode: boolean;
}) {
  const router = useRouter();
  // One key per mounted checkout: re-submitting this form can never create a second order.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [addressId, setAddressId] = useState(addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "");
  const [method, setMethod] = useState<Method | "">(methods[0] ?? "");
  const [coupon, setCoupon] = useState("");
  const [applied, setApplied] = useState("");
  const [couponError, setCouponError] = useState<string>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [adding, setAdding] = useState(false);
  const [quoting, startQuote] = useTransition();
  const [state, action, placing] = useActionState<PlaceState, FormData>(placeOrderAction, {});
  const seq = useRef(0);
  const er: Record<string, string> = t.errors;

  const requote = useCallback((a: string, m: string, c: string) => {
    const id = ++seq.current;
    startQuote(async () => {
      const q = await quoteAction({ addressId: a, method: m, couponCode: c || undefined });
      if (id !== seq.current) return; // ignore out-of-order responses
      setQuote(q);
      if (!q.ok && c && q.error.startsWith("coupon")) { setCouponError(q.error); setApplied(""); }
    });
  }, []);
  useEffect(() => { if (addressId && method) requote(addressId, method, applied); }, [addressId, method, applied, requote]);

  // The server may have cleared the cart on success; keep the header badge honest.
  useEffect(() => { if (state.total !== undefined) router.refresh(); }, [state.total, router]);
  useEffect(() => () => setCartCount(0), []);

  const err = (code?: string) => (code ? fmt(er[code] ?? er.generic, { min: "" }) : undefined);
  const q = quote?.ok ? quote : null;
  const quoteErr = quote && !quote.ok && !quote.error.startsWith("coupon") ? quote.error : undefined;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
      <div className="flex flex-col gap-8">
        <section aria-labelledby="addr-h">
          <h2 id="addr-h" className="mb-3 font-display text-xl font-bold">{t.checkout.deliverTo}</h2>
          {addresses.length === 0 && !adding && <p className="mb-3 text-sm text-muted">{t.checkout.noAddress}</p>}
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
          {method && method !== "cod" && <p className="mt-3 text-xs text-muted">🔒 {t.checkout.secureNote}</p>}
          {testMode && method && method !== "cod" && <p className="mt-2 inline-block rounded-full bg-gold-soft px-3 py-1 text-xs font-bold text-gold">⚠ {t.checkout.testMode}</p>}
        </section>

        <section aria-labelledby="cp-h">
          <h2 id="cp-h" className="mb-3 font-display text-xl font-bold">{t.checkout.coupon}</h2>
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
        </section>
      </div>

      <aside className="h-fit rounded-2xl border border-line bg-surface p-6 lg:sticky lg:top-32" aria-label={t.checkout.summary}>
        <h2 className="font-display text-xl font-bold">{t.checkout.summary}</h2>
        <ul className="mt-4 flex max-h-56 flex-col gap-3 overflow-y-auto text-sm">
          {items.map((i) => (
            <li key={i.sku} className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg text-xl" style={{ background: `hsl(${i.hue} 70% 90%)` }} aria-hidden>{i.icon}</span>
              <span className="min-w-0 flex-1"><span className="line-clamp-1">{i.name}</span><span className="text-xs text-muted">{i.variant ? `${i.variant} · ` : ""}{fmt(t.orders.qty, { n: i.qty })}</span></span>
              <span className="font-medium">{formatAED(i.lineTotal, locale)}</span>
            </li>
          ))}
        </ul>
        <dl className={`mt-5 flex flex-col gap-2 border-t border-line pt-4 text-sm transition-opacity ${quoting ? "opacity-50" : ""}`} aria-busy={quoting}>
          {q ? (
            <>
              <Row label={t.checkout.subtotal} value={formatAED(q.subtotal, locale)} />
              {q.couponDiscount > 0 && <Row label={`${t.checkout.couponLine}${q.couponCode ? ` (${q.couponCode})` : ""}`} value={`−${formatAED(q.couponDiscount, locale)}`} accent />}
              <Row label={t.checkout.delivery} value={q.deliveryFee === 0 ? t.checkout.free : formatAED(q.deliveryFee, locale)} accent={q.deliveryFee === 0} />
              {q.codFee > 0 && <Row label={t.checkout.codFee} value={formatAED(q.codFee, locale)} />}
              {q.tax > 0 && <Row label={q.taxIncluded ? t.checkout.taxIncl : t.checkout.tax} value={formatAED(q.tax, locale)} muted />}
              <div className="mt-2 flex items-baseline justify-between border-t border-line pt-3"><dt className="font-semibold">{t.checkout.total}</dt><dd className="text-2xl font-bold">{formatAED(q.total, locale)}</dd></div>
              <p className="text-xs text-muted">🚚 {fmt(t.checkout.estimate, { text: q.estimate[locale] })}</p>
            </>
          ) : quoteErr ? <p role="alert" className="text-sm text-danger">{quoteErr === "below_minimum" ? fmt(er.below_minimum, {}) : er[quoteErr] ?? er.generic}</p>
            : <div className="skeleton h-24 rounded-xl" aria-hidden />}
        </dl>

        <form action={action} className="mt-5 flex flex-col gap-3">
          <input type="hidden" name="locale" value={locale} /><input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <input type="hidden" name="addressId" value={addressId} /><input type="hidden" name="method" value={method} />
          <input type="hidden" name="couponCode" value={applied} /><input type="hidden" name="expectedTotal" value={q?.total ?? ""} />
          {state.error && (
            <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
              {er[state.error] ?? er.generic}{state.total !== undefined && <> {fmt(t.checkout.updatedTotal, { total: formatAED(state.total, locale) })}</>}
              {(state.error === "cart_issues" || state.error === "out_of_stock") && <> <Link href={`/${locale}/cart`} className="font-semibold underline">{t.checkout.cartLink}</Link></>}
            </p>
          )}
          <SubmitButton pending={placing}>{!q || !method ? t.checkout.place : method === "cod" ? t.checkout.place : t.checkout.placeCard}</SubmitButton>
          <Link href={`/${locale}/cart`} className="text-center text-sm text-muted hover:text-brand">{t.checkout.cartLink}</Link>
        </form>
        {(!q || !addressId || !method) && <p className="sr-only">{err(state.error)}</p>}
      </aside>
    </div>
  );
}

function Row({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return <div className={`flex justify-between gap-4 ${muted ? "text-muted" : ""}`}><dt>{label}</dt><dd className={accent ? "font-semibold text-brand" : "font-medium"}>{value}</dd></div>;
}
