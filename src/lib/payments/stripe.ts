import { createHmac, timingSafeEqual } from "node:crypto";
import { sign } from "./signature";
import type { PaymentEventType, PaymentProvider } from "./types";

/**
 * Stripe adapter using PaymentIntents + the Payment Element, rendered on our own /pay/card page so it can be styled to match
 * the store (card details go from the Stripe iframe straight to Stripe, never through this app).
 * Needs STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (whsec_…). Webhook: POST /api/webhooks/payments with events
 * payment_intent.succeeded, payment_intent.payment_failed, payment_intent.canceled, refund.created and refund.updated.
 * Talks to the REST API with fetch, so no SDK dependency is needed server-side.
 */
const API = "https://api.stripe.com/v1";
const API_VERSION = "2025-03-31.basil"; // pinned so behaviour does not change with the account's default version
const TOLERANCE_S = 5 * 60;
export const publishableKey = () => process.env.STRIPE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const secretKey = () => process.env.STRIPE_SECRET_KEY ?? "";
const webhookSecret = () => process.env.STRIPE_WEBHOOK_SECRET ?? "";
const authHeaders = () => ({ Authorization: `Bearer ${secretKey()}`, "Stripe-Version": API_VERSION });

async function stripe<T>(path: string, body?: URLSearchParams): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { ...authHeaders(), "Content-Type": "application/x-www-form-urlencoded" } : authHeaders(),
    body, cache: "no-store",
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${json.error?.message ?? "request failed"}`);
  return json;
}

/** Stripe-Signature: `t=<unix seconds>,v1=<hex hmac>[,v1=…]` — HMAC-SHA256 over `${t}.${rawBody}`. */
export function verifyStripeSignature(secret: string, rawBody: string, header: string | null, now = Date.now()) {
  if (!secret || !header) return false;
  const parts = header.split(",").map((p) => p.trim().split("=") as [string, string]);
  const t = parts.find(([k]) => k === "t")?.[1];
  if (!t || !Number.isFinite(Number(t)) || Math.abs(now / 1000 - Number(t)) > TOLERANCE_S) return false;
  const expected = Buffer.from(sign(secret, t, rawBody), "hex");
  return parts.some(([k, v]) => {
    if (k !== "v1" || !v) return false;
    const given = Buffer.from(v, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

type StripeEvent = {
  id: string; type: string;
  data: { object: { id: string; status?: string; amount?: number; currency?: string; metadata?: Record<string, string>; last_payment_error?: { message?: string } } };
};

const TYPES: Record<string, PaymentEventType> = {
  "payment_intent.succeeded": "payment.succeeded",
  "payment_intent.payment_failed": "payment.failed",
  "payment_intent.canceled": "payment.cancelled",
};

export const stripeProvider: PaymentProvider = {
  id: "stripe",
  methods: ["card"],
  testOnly: false,
  async createPayment({ orderNumber, amount, currency, returnUrl, email }) {
    if (!publishableKey()) throw new Error("STRIPE_PUBLISHABLE_KEY is not set");
    const ret = new URL(returnUrl);
    const p = new URLSearchParams({
      amount: String(Math.round(amount * 100)),
      currency: currency.toLowerCase(),
      "payment_method_types[0]": "card", // includes Apple Pay / Google Pay when enabled on the account
      "metadata[orderNumber]": orderNumber,
      description: `Order ${orderNumber}`,
    });
    if (email) p.set("receipt_email", email);
    const pi = await stripe<{ id: string }>("/payment_intents", p);
    const lang = ret.pathname.split("/")[1] || "en";
    const k = ret.searchParams.get("k"); // guests prove ownership with the order's tracking token
    return { redirectUrl: `${ret.origin}/${lang}/pay/card/${orderNumber}${k ? `?k=${encodeURIComponent(k)}` : ""}`, providerRef: pi.id };
  },
  verifyWebhook(rawBody, hdrs) {
    if (!verifyStripeSignature(webhookSecret(), rawBody, hdrs.get("stripe-signature"))) return null;
    let e: StripeEvent;
    try { e = JSON.parse(rawBody) as StripeEvent; } catch { return null; }
    const o = e?.data?.object;
    if (!e?.id || !o?.id) return null;
    // Refunds carry our order number + payment intent id in their metadata (set in refund() below); only a succeeded one counts.
    if ((e.type === "refund.created" || e.type === "refund.updated") && o.status === "succeeded" && o.metadata?.orderNumber && o.metadata.providerRef) {
      return { id: e.id, type: "refund.succeeded", orderNumber: o.metadata.orderNumber, providerRef: o.metadata.providerRef, amount: (o.amount ?? 0) / 100, currency: (o.currency ?? "").toUpperCase() };
    }
    const type = TYPES[e.type];
    // Verified but irrelevant events are acknowledged with an empty order number, which the processor ignores:
    // a non-2xx would make Stripe retry them for days.
    if (!type) return { id: e.id, type: "payment.cancelled", orderNumber: "", providerRef: o.id, amount: 0, currency: "" };
    return {
      id: e.id, type, orderNumber: o.metadata?.orderNumber ?? "", providerRef: o.id,
      amount: (o.amount ?? 0) / 100, currency: (o.currency ?? "").toUpperCase(), reason: o.last_payment_error?.message,
    };
  },
  async fetchStatus(providerRef) {
    const pi = await stripe<{ status: string }>(`/payment_intents/${encodeURIComponent(providerRef)}`);
    return pi.status === "succeeded" ? "paid" : pi.status === "canceled" ? "failed" : "pending";
  },
  async refund({ providerRef, amount }) {
    try {
      const pi = await stripe<{ metadata?: Record<string, string> }>(`/payment_intents/${encodeURIComponent(providerRef)}`);
      if (!pi.metadata?.orderNumber) return { accepted: false };
      await stripe("/refunds", new URLSearchParams({
        payment_intent: providerRef, amount: String(Math.round(amount * 100)),
        "metadata[orderNumber]": pi.metadata.orderNumber, "metadata[providerRef]": providerRef, // lets the refund webhook find the order
      }));
      return { accepted: true };
    } catch { return { accepted: false }; }
  },
};

/** Client secret of a payment intent that can still be paid, for the pay page. Null once it is paid or cancelled. */
export async function getPayableClientSecret(paymentIntentId: string): Promise<string | null> {
  try {
    const pi = await stripe<{ status: string; client_secret?: string | null }>(`/payment_intents/${encodeURIComponent(paymentIntentId)}`);
    return ["requires_payment_method", "requires_confirmation", "requires_action"].includes(pi.status) ? pi.client_secret ?? null : null;
  } catch { return null; }
}

// Kept for tests: build a correctly signed Stripe-style header.
export const stripeSignatureHeader = (secret: string, body: string, nowMs = Date.now()) => {
  const t = String(Math.floor(nowMs / 1000));
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
};
