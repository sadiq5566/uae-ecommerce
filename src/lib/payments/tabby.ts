import { timingSafeEqual } from "node:crypto";
import type { PaymentEvent, PaymentProvider } from "./types";

/**
 * Tabby "Pay in 4" (UAE). Hosted flow: create a session, redirect the customer to Tabby, then trust only Tabby's server API:
 * the webhook is re-checked with GET /payments/{id} and an AUTHORIZED payment is captured (only captured payments settle).
 * Env: TABBY_SECRET_KEY (sk_test_… / sk_…), TABBY_MERCHANT_CODE, TABBY_WEBHOOK_SECRET (the value you register as header X-Auth-Key).
 * Register the webhook with `npm run tabby:webhook -- https://<site>/api/webhooks/tabby`.
 */
const API = "https://api.tabby.ai/api";
export const TABBY_AUTH_HEADER = "x-auth-key";
const secret = () => process.env.TABBY_SECRET_KEY ?? "";
const auth = () => ({ Authorization: `Bearer ${secret()}`, "Content-Type": "application/json" });
const money = (n: number) => n.toFixed(2);

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...auth(), ...init?.headers }, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(`Tabby ${res.status}: ${json.error ?? "request failed"}`);
  return json;
}

/** Tabby wants an international number: 050 123 4567 → +971501234567. */
export function tabbyPhone(raw: string) {
  const d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d;
  if (d.startsWith("00")) return `+${d.slice(2)}`;
  if (d.startsWith("971")) return `+${d}`;
  return `+971${d.replace(/^0/, "")}`;
}

const sameSecret = (a: string, b: string) => !!a && !!b && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

type TabbyPayment = {
  id: string; status: string; amount: string; currency: string; order?: { reference_id?: string };
  captures?: { id: string }[]; refunds?: { id: string }[];
};

export const tabbyProvider: PaymentProvider = {
  id: "tabby",
  methods: ["tabby"],
  testOnly: false,
  async createPayment({ orderNumber, amount, currency, returnUrl, email, buyer }) {
    if (!buyer) throw new Error("Tabby needs buyer details");
    const session = await call<{
      status: string; payment: { id: string };
      configuration?: { available_products?: { installments?: { web_url: string }[] }; products?: { installments?: { rejection_reason?: string | null } } };
    }>("/v2/checkout", {
      method: "POST",
      body: JSON.stringify({
        payment: {
          amount: money(amount), currency,
          description: `Order ${orderNumber}`,
          buyer: { name: buyer.name, phone: tabbyPhone(buyer.phone), email: email ?? buyer.email },
          shipping_address: { city: buyer.city, address: buyer.address, zip: "00000" },
          order: {
            reference_id: orderNumber,
            items: buyer.items.map((i) => ({ title: i.title, quantity: i.quantity, unit_price: money(i.unitPrice), category: i.category })),
          },
          buyer_history: { registered_since: (buyer.registeredSince ?? new Date()).toISOString() },
        },
        lang: buyer.lang,
        merchant_code: process.env.TABBY_MERCHANT_CODE,
        merchant_urls: { success: returnUrl, cancel: returnUrl, failure: returnUrl },
      }),
    });
    const url = session.configuration?.available_products?.installments?.[0]?.web_url;
    if (session.status === "rejected" || !url) {
      throw new Error(`Tabby declined the session (${session.configuration?.products?.installments?.rejection_reason ?? "not_available"})`);
    }
    return { redirectUrl: url, providerRef: session.payment.id };
  },
  verifyWebhook(rawBody, headers) {
    if (!sameSecret(headers.get(TABBY_AUTH_HEADER) ?? "", process.env.TABBY_WEBHOOK_SECRET ?? "")) return null;
    let p: TabbyPayment;
    try { p = JSON.parse(rawBody) as TabbyPayment; } catch { return null; }
    if (!p?.id) return null;
    const status = String(p.status).toLowerCase();
    const captures = p.captures?.length ?? 0; const refunds = p.refunds?.length ?? 0;
    const base = { id: `${p.id}:${status}:${captures}:${refunds}`, orderNumber: p.order?.reference_id ?? "", providerRef: p.id, amount: Number(p.amount), currency: String(p.currency).toUpperCase() };
    if (status === "closed" && refunds > 0) return { ...base, type: "refund.succeeded" };
    if (status === "authorized" || status === "closed") return { ...base, type: "payment.succeeded" };
    if (status === "rejected") return { ...base, type: "payment.failed", reason: "rejected by Tabby" };
    if (status === "expired") return { ...base, type: "payment.cancelled" };
    return { ...base, orderNumber: "", type: "payment.cancelled" }; // e.g. "created": acknowledged, nothing to do
  },
  /** Never trust the webhook body for money: re-read the payment from Tabby, then capture it if it is only authorized. */
  async confirmEvent(e: PaymentEvent) {
    if (e.type !== "payment.succeeded" || !e.orderNumber) return e;
    const p = await call<TabbyPayment>(`/v2/payments/${encodeURIComponent(e.providerRef)}`);
    if (p.order?.reference_id !== e.orderNumber) return null;
    const status = p.status.toUpperCase();
    if (status !== "AUTHORIZED" && status !== "CLOSED") return null;
    if (status === "AUTHORIZED") {
      await call(`/v2/payments/${encodeURIComponent(p.id)}/captures`, { method: "POST", body: JSON.stringify({ amount: p.amount, reference_id: e.orderNumber }) });
    }
    return { ...e, amount: Number(p.amount), currency: p.currency.toUpperCase() };
  },
  async fetchStatus(providerRef) {
    const p = await call<TabbyPayment>(`/v2/payments/${encodeURIComponent(providerRef)}`);
    const s = p.status.toUpperCase();
    return s === "AUTHORIZED" || s === "CLOSED" ? "paid" : s === "REJECTED" || s === "EXPIRED" ? "failed" : "pending";
  },
  async refund({ providerRef, amount }) {
    try {
      await call(`/v2/payments/${encodeURIComponent(providerRef)}/refunds`, { method: "POST", body: JSON.stringify({ amount: money(amount), reference_id: `refund-${providerRef}` }) });
      return { accepted: true };
    } catch { return { accepted: false }; }
  },
};
