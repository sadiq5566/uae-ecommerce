"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isLocale } from "@/lib/i18n";
import { rateLimit } from "@/lib/rate-limit";
import { placeOrder, startPaymentFor } from "@/features/orders/place";
import { availableMethods, prepare, validateCoupon, type CheckoutError } from "./prepare";
import { PAYMENT_METHODS, type PaymentMethod } from "@/models/order";

export type Quote = {
  ok: true;
  subtotal: number; itemDiscounts: number; couponDiscount: number; discountedSubtotal: number; deliveryFee: number; codFee: number;
  tax: number; taxIncluded: boolean; total: number; freeDelivery: boolean; zoneName: { en: string; ar: string }; estimate: { en: string; ar: string };
  couponCode?: string;
} | { ok: false; error: CheckoutError; minOrder?: number };

const method = (v: unknown): PaymentMethod | null => (PAYMENT_METHODS as readonly string[]).includes(String(v)) ? (v as PaymentMethod) : null;

/** Server-computed price breakdown for the checkout summary. Display only — placing the order recomputes it all. */
export async function quoteAction(raw: { addressId?: string; method: string; couponCode?: string }): Promise<Quote> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "invalid" };
  // Server actions are public endpoints: never assume the argument has the TypeScript shape.
  const input = { addressId: typeof raw?.addressId === "string" ? raw.addressId : undefined, method: raw?.method, couponCode: typeof raw?.couponCode === "string" ? raw.couponCode.slice(0, 40) : undefined };
  const m = method(input.method);
  if (!m) return { ok: false, error: "method_unavailable" };
  if (input.couponCode?.trim()) {
    const rl = await rateLimit(`coupon:${user.id}`, 20, 900); // stop coupon-code guessing
    if (!rl.ok) return { ok: false, error: "invalid" };
  }
  const r = await prepare({ userId: user.id, addressId: input.addressId, method: m, couponCode: input.couponCode });
  if (!r.ok) return { ok: false, error: r.error };
  const t = r.p.totals;
  return { ok: true, subtotal: t.subtotal, itemDiscounts: t.itemDiscounts, couponDiscount: t.couponDiscount, discountedSubtotal: t.discountedSubtotal, deliveryFee: t.deliveryFee, codFee: t.codFee, tax: t.tax, taxIncluded: t.taxIncluded, total: t.total, freeDelivery: t.freeDelivery, zoneName: r.p.zone.name, estimate: r.p.zone.estimate, couponCode: r.p.coupon?.rule.code };
}

export async function checkCouponAction(code: string): Promise<{ ok: boolean; error?: CheckoutError }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "invalid" };
  if (!(await rateLimit(`coupon:${user.id}`, 20, 900)).ok) return { ok: false, error: "invalid" };
  const v = await validateCoupon(typeof code === "string" ? code.slice(0, 40) : "", user.id);
  return "error" in v ? { ok: false, error: v.error } : { ok: true };
}

export type PlaceState = { error?: CheckoutError; detail?: string; total?: number };

export async function placeOrderAction(_: PlaceState, fd: FormData): Promise<PlaceState> {
  const user = await getCurrentUser();
  const lang = String(fd.get("locale") ?? "en");
  const locale = isLocale(lang) ? lang : "en";
  if (!user) redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/checkout`)}`);
  const m = method(fd.get("method"));
  if (!m) return { error: "method_unavailable" };
  if (!(await rateLimit(`checkout:${user.id}`, 10, 600)).ok) return { error: "invalid" };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  const returnBase = process.env.NEXT_PUBLIC_SITE_URL && process.env.NODE_ENV === "production" ? process.env.NEXT_PUBLIC_SITE_URL : `${proto}://${host}`;
  const expected = Number(fd.get("expectedTotal"));
  const res = await placeOrder({
    userId: user.id, email: user.email, locale, addressId: String(fd.get("addressId") ?? ""), method: m,
    couponCode: String(fd.get("couponCode") ?? "").slice(0, 40) || undefined, idempotencyKey: String(fd.get("idempotencyKey") ?? ""),
    expectedTotal: Number.isFinite(expected) ? expected : undefined, returnBase,
  });
  if (!res.ok) return { error: res.error, detail: res.detail, total: res.total };
  if (res.redirectUrl) redirect(res.redirectUrl);
  redirect(`/${locale}/account/orders/${res.orderNumber}?placed=1`);
}

/** Retry payment for an unpaid order from the order page. */
export async function retryPaymentAction(fd: FormData) {
  const user = await getCurrentUser();
  const lang = String(fd.get("locale") ?? "en"); const locale = isLocale(lang) ? lang : "en";
  if (!user) redirect(`/${locale}/login`);
  const number = String(fd.get("orderNumber") ?? "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const base = process.env.NEXT_PUBLIC_SITE_URL && process.env.NODE_ENV === "production" ? process.env.NEXT_PUBLIC_SITE_URL : `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
  const res = await startPaymentFor(number, base, user.id);
  if (res.ok && res.redirectUrl) redirect(res.redirectUrl);
  redirect(`/${locale}/account/orders/${number}`);
}

export async function getAvailableMethodsAction() { return availableMethods(); }
