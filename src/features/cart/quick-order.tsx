"use client";
import Image from "@/components/img";
import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { inputCls } from "@/components/form-ui";
import type { Dictionary } from "@/lib/dictionaries";
import { EMIRATES } from "@/lib/emirates";
import { fmt } from "@/lib/format";
import { formatAED, type Locale } from "@/lib/i18n";
import { placeOrderAction, quoteAction, type PlaceState, type Quote } from "@/features/checkout/actions";
import type { DrawerData } from "./drawer-actions";
import type { CartView } from "./service";

type Guest = Record<"recipientName" | "phone" | "email" | "emirate" | "area" | "building" | "unit" | "street" | "landmark", string>;

/**
 * "Order now" popup: one screen to confirm delivery, pick a payment method and place the order.
 * A saved address is used straight away; with none, the delivery form is shown instead.
 */
export function QuickOrder({ locale, t, cart, quick, buy, onClose }: { locale: Locale; t: Dictionary; cart: CartView; quick: DrawerData["quick"]; buy?: { sku: string; qty: number }; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { guest, addresses, methods, testMode, credit } = quick;
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const inline = guest || addresses.length === 0 || adding;
  const [addressId, setAddressId] = useState(addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "");
  const [g, setG] = useState<Guest>({ recipientName: quick.defaultName ?? "", phone: quick.defaultPhone ?? "", email: "", emirate: "", area: "", building: "", unit: "", street: "", landmark: "" });
  const set = (k: keyof Guest) => (e: { target: { value: string } }) => setG((x) => ({ ...x, [k]: e.target.value }));
  const [dPhone, setDPhone] = useState(""); const [dEmail, setDEmail] = useState("");
  useEffect(() => { const id = setTimeout(() => { setDPhone(g.phone); setDEmail(g.email); }, 500); return () => clearTimeout(id); }, [g.phone, g.email]);
  const [method, setMethod] = useState<string>(methods[0] ?? "");
  const [useCredit, setUseCredit] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, startQuote] = useTransition();
  const [idempotencyKey] = useState(() => crypto.randomUUID()); // one key per popup: a double click can never create two orders
  const [state, action, placing] = useActionState<PlaceState, FormData>(placeOrderAction, {});
  const seq = useRef(0);
  const er: Record<string, string> = t.errors;
  const fe = state.fieldErrors ?? {};

  useEffect(() => { ref.current?.showModal(); }, []);

  const requote = useCallback((a: string, m: string, extra: { emirate?: string; phone?: string; email?: string }) => {
    const id = ++seq.current;
    startQuote(async () => {
      const q = await quoteAction({ addressId: a || undefined, method: m, useCredit: !!credit && useCredit, buy, ...extra });
      if (id === seq.current) setQuote(q); // ignore out-of-order responses
    });
  }, [credit, useCredit, buy]);
  useEffect(() => {
    if (!method) return;
    if (inline) { if (g.emirate) requote("", method, { emirate: g.emirate, phone: dPhone, email: dEmail }); }
    else if (addressId) requote(addressId, method, {});
  }, [addressId, method, requote, inline, g.emirate, dPhone, dEmail]);

  const stale = inline && !g.emirate; // no emirate yet: whatever was quoted before no longer applies
  const q = !stale && quote?.ok ? quote : null;
  const quoteErr = !stale && quote && !quote.ok ? quote.error : undefined;
  const saved = addresses.find((a) => a.id === addressId);
  const emirateName = (e: string) => t.address.emirates[e as keyof typeof t.address.emirates] ?? e;
  const itemCount = cart.itemCount;

  const gf = (k: keyof Guest, label: string, opts: { type?: string; required?: boolean; auto?: string; ph?: string; span?: boolean } = {}) => (
    <div className={opts.span ? "sm:col-span-2" : ""}>
      <label htmlFor={`q-${k}`} className="mb-1 block text-xs font-medium">{label}</label>
      <input id={`q-${k}`} name={k} type={opts.type ?? "text"} value={g[k]} onChange={set(k)} required={opts.required} autoComplete={opts.auto} placeholder={opts.ph} maxLength={150}
        aria-invalid={!!fe[k]} aria-describedby={fe[k] ? `q-${k}-err` : undefined} className={`${inputCls} !py-2.5`} />
      {fe[k] && <p id={`q-${k}-err`} role="alert" className="mt-1 text-xs text-danger">{er[fe[k]] ?? er.generic}</p>}
    </div>
  );

  const label = !q || q.creditCovers || method === "cod" ? t.checkout.place : t.checkout.placeCard;

  return (
    <dialog ref={ref} aria-label={t.cart.quickTitle} onClose={onClose} onClick={(e) => e.target === ref.current && !placing && ref.current?.close()}
      className="m-auto max-h-[94dvh] w-[min(96vw,34rem)] max-w-none overflow-hidden rounded-2xl bg-surface p-0 text-fg shadow-card backdrop:bg-black/60 backdrop:backdrop-blur-sm open:flex open:flex-col">
      <form action={action} className="flex min-h-0 flex-1 flex-col">
        {buy && <><input type="hidden" name="buySku" value={buy.sku} /><input type="hidden" name="buyQty" value={buy.qty} /></>}
        <input type="hidden" name="locale" value={locale} /><input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        {!inline && <input type="hidden" name="addressId" value={addressId} />}
        <input type="hidden" name="method" value={method} /><input type="hidden" name="couponCode" value="" />
        <input type="hidden" name="useCredit" value={credit && useCredit ? "1" : "0"} /><input type="hidden" name="expectedTotal" value={q?.total ?? ""} />
        {inline && !guest && <input type="hidden" name="saveAddress" value="1" />}

        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-xl font-bold">⚡ {t.cart.quickTitle} <span className="text-sm font-normal text-muted">({fmt(t.checkout.itemCount, { n: itemCount })})</span></h2>
          <button type="button" onClick={() => ref.current?.close()} aria-label={t.nav.close} className="grid size-9 place-items-center rounded-full hover:bg-surface-2">✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-5">
            <ul className="flex flex-col gap-3 rounded-xl bg-surface-2 p-3" aria-label={t.checkout.summary}>
              {cart.lines.filter((l) => l.qty > 0).map((l) => (
                <li key={l.sku} className="flex items-center gap-3 text-sm">
                  <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-surface text-2xl" aria-hidden>
                    {l.image ? <Image src={l.image} alt="" fill sizes="56px" className="object-cover" /> : l.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 font-medium leading-snug">{l.name[locale]}</span>
                    <span className="block text-xs text-muted">{l.variantLabel ? `${l.variantLabel[locale]} · ` : ""}{fmt(t.orders.qty, { n: l.qty })}</span>
                  </span>
                  <span className="shrink-0 font-semibold">{formatAED(l.lineTotal, locale)}</span>
                </li>
              ))}
            </ul>

            <section aria-labelledby="qo-addr">
              <h3 id="qo-addr" className="mb-2 text-sm font-semibold">{inline ? (guest ? t.checkout.contact : t.checkout.deliverTo) : t.cart.deliverHere}</h3>
              {inline ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {gf("recipientName", t.address.recipient, { required: true, auto: "name" })}
                  {gf("phone", t.address.phone, { type: "tel", required: true, auto: "tel", ph: "050 123 4567" })}
                  {guest && gf("email", t.checkout.email, { type: "email", auto: "email", span: true, required: true })}
                  <div>
                    <label htmlFor="q-emirate" className="mb-1 block text-xs font-medium">{t.address.emirate}</label>
                    <select id="q-emirate" name="emirate" value={g.emirate} onChange={set("emirate")} required aria-invalid={!!fe.emirate} className={`${inputCls} !py-2.5`}>
                      <option value="" disabled>{t.address.select}</option>
                      {EMIRATES.map((x) => <option key={x} value={x}>{t.address.emirates[x]}</option>)}
                    </select>
                    {fe.emirate && <p role="alert" className="mt-1 text-xs text-danger">{er[fe.emirate] ?? er.generic}</p>}
                  </div>
                  {gf("area", t.address.area, { required: true })}
                  {gf("building", t.address.building, { required: true, span: true })}
                  <details className="sm:col-span-2" open={!!(fe.street || fe.unit || fe.landmark)}>
                    <summary className="cursor-pointer text-xs font-semibold text-brand">+ {t.checkout.moreDetails}</summary>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">{gf("street", t.address.street)}{gf("unit", t.address.unit)}{gf("landmark", t.address.landmark, { span: true })}</div>
                  </details>
                  {adding && <button type="button" onClick={() => setAdding(false)} className="text-start text-xs font-semibold text-brand hover:underline sm:col-span-2">← {t.cart.useSaved}</button>}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {(picking ? addresses : saved ? [saved] : []).map((a) => (
                    <label key={a.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${addressId === a.id ? "border-brand bg-brand-soft" : "border-line hover:border-brand"}`}>
                      <input type="radio" name="address-choice" checked={addressId === a.id} onChange={() => { setAddressId(a.id); setPicking(false); }} className="mt-1 size-4 accent-[var(--brand)]" />
                      <span className="min-w-0">
                        <span className="font-semibold">{a.label || a.recipientName}</span>
                        {a.isDefault && <span className="ms-2 rounded-full bg-brand px-2 py-0.5 text-xs text-brand-fg">{t.address.default}</span>}
                        <span className="block text-muted">{[a.unit, a.building, a.street, a.area].filter(Boolean).join(", ")}, {emirateName(a.emirate)}</span>
                        <span className="block text-muted" dir="ltr">{a.phone}</span>
                      </span>
                    </label>
                  ))}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-brand">
                    {addresses.length > 1 && <button type="button" onClick={() => setPicking((p) => !p)} className="hover:underline">{t.cart.change}</button>}
                    <button type="button" onClick={() => setAdding(true)} className="hover:underline">+ {t.cart.addNew}</button>
                  </div>
                </div>
              )}
            </section>

            {credit && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-brand/40 bg-brand-soft p-3 text-sm">
                <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
                <span><b className="block">💳 {t.credit.useFirst}</b><span className="text-brand">{fmt(t.credit.available, { amount: formatAED(credit.balance, locale) })}</span></span>
              </label>
            )}

            {q?.creditCovers ? (
              <p role="status" className="rounded-xl border border-brand bg-brand-soft p-3 text-sm font-medium text-brand">✓ {t.credit.covers}</p>
            ) : (
              <section aria-labelledby="qo-pay">
                <h3 id="qo-pay" className="mb-2 text-sm font-semibold">{t.checkout.payment}</h3>
                {methods.length === 0 ? <p role="alert" className="text-sm text-danger">{t.checkout.noMethods}</p> : (
                  <div role="radiogroup" aria-labelledby="qo-pay" className="grid gap-2">
                    {methods.map((m) => (
                      <label key={m} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${method === m ? "border-brand bg-brand-soft" : "border-line hover:border-brand"}`}>
                        <input type="radio" name="method-choice" className="size-4 accent-[var(--brand)]" checked={method === m} onChange={() => setMethod(m)} />
                        <span><span className="block font-semibold">{t.checkout.methods[m]}</span><span className="block text-xs text-muted">{t.checkout.methodNotes[m]}</span></span>
                      </label>
                    ))}
                  </div>
                )}
                {method && method !== "cod" && <p className="mt-2 text-xs text-muted">🔒 {t.checkout.secureNote}</p>}
                {testMode && method && method !== "cod" && <p className="mt-2 inline-block rounded-full bg-gold-soft px-3 py-1 text-xs font-bold text-gold-ink">⚠ {t.checkout.testMode}</p>}
              </section>
            )}

            <div className={`rounded-xl bg-surface-2 p-3 text-sm transition-opacity ${quoting ? "opacity-50" : ""}`} aria-busy={quoting}>
              {q ? (
                <dl className="flex flex-col gap-1.5">
                  <Row label={t.checkout.subtotal} value={formatAED(q.subtotal, locale)} />
                  {q.couponDiscount > 0 && <Row label={t.checkout.couponLine} value={`−${formatAED(q.couponDiscount, locale)}`} accent />}
                  {q.offerDiscount > 0 && <Row label={t.checkout.itemDiscounts} value={`−${formatAED(q.offerDiscount, locale)}`} accent />}
                  <Row label={`${t.checkout.delivery} · ${q.zoneName[locale]}`} value={q.deliveryFee === 0 ? t.checkout.free : formatAED(q.deliveryFee, locale)} accent={q.deliveryFee === 0} />
                  {q.codFee > 0 && <Row label={t.checkout.codFee} value={formatAED(q.codFee, locale)} />}
                  {q.creditApplied > 0 && <Row label={t.credit.line} value={`−${formatAED(q.creditApplied, locale)}`} accent />}
                  <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2"><dt className="font-semibold">{t.checkout.total}</dt><dd className="text-xl font-bold">{formatAED(q.total, locale)}</dd></div>
                  <p className="text-xs text-muted">🚚 {fmt(t.checkout.estimate, { text: q.estimate[locale] })}</p>
                </dl>
              ) : quoteErr ? <p role="alert" className="text-danger">{quoteErr === "below_minimum" ? fmt(er.below_minimum, {}) : er[quoteErr] ?? er.generic}</p>
                : inline && !g.emirate ? (
                  <dl className="flex flex-col gap-1.5"><Row label={t.checkout.subtotal} value={formatAED(cart.subtotal, locale)} /><p className="text-xs text-muted">{t.checkout.pickEmirate}</p></dl>
                ) : <div className="skeleton h-16 rounded-lg" aria-hidden />}
            </div>

            {state.error && (
              <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
                {er[state.error] ?? er.generic}{state.total !== undefined && <> {fmt(t.checkout.updatedTotal, { total: formatAED(state.total, locale) })}</>}
                {(state.error === "cart_issues" || state.error === "out_of_stock") && <> <Link href={`/${locale}/cart`} className="font-semibold underline">{t.checkout.cartLink}</Link></>}
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-line bg-surface px-5 py-4">
          <button disabled={placing || !q || !method} className="w-full rounded-xl bg-brand px-5 py-3 font-semibold text-brand-fg transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60">
            {placing ? <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent align-middle" aria-hidden /> : <>⚡ {label}{q ? ` · ${formatAED(q.total, locale)}` : ""}</>}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div className="flex justify-between gap-4"><dt>{label}</dt><dd className={accent ? "font-semibold text-brand" : "font-medium"}>{value}</dd></div>;
}
