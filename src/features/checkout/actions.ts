"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getGuestId } from "@/features/cart/service";
import { getOrderByToken } from "@/features/orders/queries";
import { addressSchema, fieldErrors, normalizeUaePhone } from "@/features/auth/schemas";
import { z } from "zod";
import { isLocale } from "@/lib/i18n";
import { rateLimit } from "@/lib/rate-limit";
import { placeOrder, startPaymentFor } from "@/features/orders/place";
import { availableMethods, prepare, validateCoupon, type CheckoutError, type InlineAddress } from "./prepare";
import { PAYMENT_METHODS, type PaymentMethod } from "@/models/order";

export type Quote = {
  ok: true;
  subtotal: number; itemDiscounts: number; couponDiscount: number; discountedSubtotal: number; deliveryFee: number; codFee: number;
  tax: number; taxIncluded: boolean; total: number; freeDelivery: boolean; zoneName: { en: string; ar: string }; estimate: { en: string; ar: string };
  couponCode?: string;
  offerDiscount: number; offer?: { kind: "coupon" | "tier" | "first_order"; code?: string; percent?: number }; couponBeaten: boolean; autoBest: number; autoBestOffer?: { kind: "coupon" | "tier" | "first_order"; percent?: number }; firstOrder: boolean;
  /** Web credit: the customer's spendable balance, what this order uses of it, and whether it pays for everything. */
  creditBalance: number; creditApplied: number; creditCovers: boolean;
} | { ok: false; error: CheckoutError; minOrder?: number };

const buyOf = (v: unknown): { sku: string; qty: number } | undefined => {
  const b = v as { sku?: unknown; qty?: unknown } | null;
  return b && typeof b.sku === "string" && b.sku.length <= 64 ? { sku: b.sku, qty: Number(b.qty) || 1 } : undefined;
};

const method = (v: unknown): PaymentMethod | null => (PAYMENT_METHODS as readonly string[]).includes(String(v)) ? (v as PaymentMethod) : null;

/** Server-computed price breakdown for the checkout summary. Display only — placing the order recomputes it all. */
export async function quoteAction(raw: { addressId?: string; emirate?: string; method: string; couponCode?: string; useCredit?: boolean; phone?: string; email?: string; buy?: { sku: string; qty: number } }): Promise<Quote> {
  const user = await getCurrentUser();
  const buy = buyOf(raw?.buy);
  // "Buy now" can arrive before the visitor has any cart cookie.
  const guestId = user ? undefined : (await getGuestId()) ?? (buy ? "buy-now-quote" : undefined);
  if (!user && !guestId) return { ok: false, error: "empty_cart" };
  const who = user?.id ?? guestId!;
  // Server actions are public endpoints: never assume the argument has the TypeScript shape.
  const input = { addressId: typeof raw?.addressId === "string" ? raw.addressId : undefined, method: raw?.method, couponCode: typeof raw?.couponCode === "string" ? raw.couponCode.slice(0, 40) : undefined };
  const m = method(input.method);
  if (!m) return { ok: false, error: "method_unavailable" };
  if (input.couponCode?.trim()) {
    const rl = await rateLimit(`coupon:${who}`, 20, 900); // stop coupon-code guessing
    if (!rl.ok) return { ok: false, error: "invalid" };
  }
  const emirate = typeof raw?.emirate === "string" && raw.emirate.length < 30 ? raw.emirate : undefined;
  const phone = typeof raw?.phone === "string" ? normalizeUaePhone(raw.phone) ?? undefined : undefined;
  const email = user?.email ?? (typeof raw?.email === "string" && raw.email.length < 255 && z.email().safeParse(raw.email.trim()).success ? raw.email.trim() : undefined);
  const r = await prepare({ userId: user?.id, guestId, email, phone, addressId: input.addressId, emirate, buy, method: m, couponCode: input.couponCode, useCredit: raw?.useCredit === true });
  if (!r.ok) return { ok: false, error: r.error };
  const t = r.p.totals;
  return { ok: true, subtotal: t.subtotal, itemDiscounts: t.itemDiscounts, couponDiscount: t.couponDiscount, discountedSubtotal: t.discountedSubtotal, deliveryFee: t.deliveryFee, codFee: t.codFee, tax: t.tax, taxIncluded: t.taxIncluded, total: r.p.credit.payable, freeDelivery: t.freeDelivery, zoneName: r.p.zone.name, estimate: r.p.zone.estimate, couponCode: r.p.coupon?.rule.code, offerDiscount: t.offerDiscount, offer: t.offer, couponBeaten: t.couponBeaten, autoBest: t.autoBest, autoBestOffer: t.autoBestOffer, firstOrder: r.p.firstOrder, creditBalance: r.p.credit.balanceFils / 100, creditApplied: r.p.credit.appliedFils / 100, creditCovers: r.p.method === "credit" };
}

export async function checkCouponAction(code: string): Promise<{ ok: boolean; error?: CheckoutError }> {
  const user = await getCurrentUser();
  const who = user?.id ?? (await getGuestId());
  if (!who) return { ok: false, error: "invalid" };
  if (!(await rateLimit(`coupon:${who}`, 20, 900)).ok) return { ok: false, error: "invalid" };
  const v = await validateCoupon(typeof code === "string" ? code.slice(0, 40) : "", { userId: user?.id });
  return "error" in v ? { ok: false, error: v.error } : { ok: true };
}

export type PlaceState = { error?: CheckoutError; detail?: string; total?: number; fieldErrors?: Record<string, string>; values?: Record<string, string> };

// Guest details: same rules as a saved address, plus an optional email for the confirmation.
const guestSchema = addressSchema.omit({ label: true, isDefault: true }).extend({
  email: z.string().trim().toLowerCase().max(254, "email_invalid").optional().transform((v, ctx) => {
    if (!v) return undefined;
    if (!z.email().safeParse(v).success) { ctx.addIssue({ code: "custom", message: "email_invalid" }); return z.NEVER; }
    return v;
  }),
});

export async function placeOrderAction(_: PlaceState, fd: FormData): Promise<PlaceState> {
  const user = await getCurrentUser();
  const guestId = user ? undefined : await getGuestId();
  const lang = String(fd.get("locale") ?? "en");
  const locale = isLocale(lang) ? lang : "en";
  const m = method(fd.get("method"));
  if (!m) return { error: "method_unavailable" };
  const buy = fd.get("buySku") ? buyOf({ sku: String(fd.get("buySku")), qty: fd.get("buyQty") }) : undefined;
  // "Buy now" works even with an empty cart; otherwise there must be a cart to check out.
  if (!user && !guestId && !buy) return { error: "empty_cart" };

  let address: InlineAddress | undefined; let email = user?.email;
  if (!user || !fd.get("addressId")) {
    const parsed = guestSchema.safeParse(Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")));
    if (!parsed.success) {
      const values: Record<string, string> = {};
      for (const [k, v] of fd.entries()) if (typeof v === "string" && v.length < 500 && !/^(idempotencyKey|expectedTotal)$/.test(k)) values[k] = v;
      return { error: "invalid", fieldErrors: fieldErrors(parsed.error), values };
    }
    const { email: e, ...addr } = parsed.data;
    address = addr; email = user?.email ?? e;
  }
  // Guests need a cookie to own the order's idempotency/cart; "buy now" may arrive before any cart exists.
  const owner = user?.id ?? guestId ?? `buy:${String(fd.get("idempotencyKey") ?? "").slice(0, 24)}`;
  if (!(await rateLimit(`checkout:${owner}`, 10, 600)).ok) return { error: "invalid" };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!user && ip && !(await rateLimit(`checkout-ip:${ip}`, 20, 600)).ok) return { error: "invalid" };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  const returnBase = process.env.NEXT_PUBLIC_SITE_URL && process.env.NODE_ENV === "production" ? process.env.NEXT_PUBLIC_SITE_URL : `${proto}://${host}`;
  const expected = Number(fd.get("expectedTotal"));
  const res = await placeOrder({
    userId: user?.id, guestId: guestId ?? (buy ? `buy-${owner}` : undefined), email, locale, addressId: address ? undefined : String(fd.get("addressId") ?? ""), address, buy, method: m,
    useCredit: !!user && fd.get("useCredit") === "1", couponCode: String(fd.get("couponCode") ?? "").slice(0, 40) || undefined, idempotencyKey: String(fd.get("idempotencyKey") ?? ""),
    expectedTotal: Number.isFinite(expected) ? expected : undefined, returnBase,
  });
  if (!res.ok) return { error: res.error, detail: res.detail, total: res.total };
  if (res.redirectUrl) redirect(res.redirectUrl);
  redirect(res.guest ? `/${locale}/track/${res.orderNumber}?k=${res.trackToken}&placed=1` : `/${locale}/account/orders/${res.orderNumber}?placed=1`);
}

/** Retry payment for an unpaid order from the order page. */
export async function retryPaymentAction(fd: FormData) {
  const user = await getCurrentUser();
  const lang = String(fd.get("locale") ?? "en"); const locale = isLocale(lang) ? lang : "en";
  const number = String(fd.get("orderNumber") ?? "");
  const token = String(fd.get("token") ?? "");
  // Guests prove ownership with the order's secret tracking token instead of a session.
  const guestOrder = !user && token ? await getOrderByToken(number, token) : null;
  if (!user && !guestOrder) redirect(`/${locale}/login`);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const base = process.env.NEXT_PUBLIC_SITE_URL && process.env.NODE_ENV === "production" ? process.env.NEXT_PUBLIC_SITE_URL : `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
  const res = await startPaymentFor(number, base, user?.id);
  if (res.ok && res.redirectUrl) redirect(res.redirectUrl);
  redirect(guestOrder ? `/${locale}/track/${number}?k=${token}` : `/${locale}/account/orders/${number}`);
}

export async function getAvailableMethodsAction() { return availableMethods(); }
