import { randomBytes } from "node:crypto";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, sign, verifySignature } from "./signature";
import type { PaymentEvent, PaymentProvider } from "./types";

export const webhookSecret = () => process.env.PAYMENT_WEBHOOK_SECRET ?? "";

/** TEST-ONLY provider. Never registered in production (see registry). No real money moves. */
export const mockProvider: PaymentProvider = {
  id: "mock",
  methods: ["card"],
  testOnly: true,
  async createPayment({ orderNumber, returnUrl }) {
    const base = new URL(returnUrl).origin;
    const lang = new URL(returnUrl).pathname.split("/")[1] || "en";
    return { redirectUrl: `${base}/${lang}/pay/mock/${orderNumber}`, providerRef: `mock_${randomBytes(9).toString("hex")}` };
  },
  verifyWebhook(rawBody, headers) {
    if (!verifySignature(webhookSecret(), rawBody, headers.get(SIGNATURE_HEADER), headers.get(TIMESTAMP_HEADER))) return null;
    try {
      const e = JSON.parse(rawBody) as PaymentEvent;
      return e && typeof e.id === "string" && typeof e.orderNumber === "string" && typeof e.amount === "number" ? e : null;
    } catch { return null; }
  },
  async refund() { return { accepted: true }; },
};

/** Build a signed webhook request the way the gateway would (used by the mock pay page and tests). */
export function signedMockEvent(event: PaymentEvent, now = Date.now()) {
  const body = JSON.stringify(event);
  const ts = String(now);
  return { body, headers: new Headers({ [SIGNATURE_HEADER]: sign(webhookSecret(), ts, body), [TIMESTAMP_HEADER]: ts }) };
}
