import { describe, expect, it } from "vitest";
import { stripeProvider, stripeSignatureHeader } from "@/lib/payments/stripe";

const SECRET = "whsec_test_secret";
const hdr = (body: string, secret = SECRET) => new Headers({ "stripe-signature": stripeSignatureHeader(secret, body) });
const evt = (type: string, object: object) => JSON.stringify({ id: "evt_1", type, data: { object } });

describe("stripe webhook adapter", () => {
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;

  it("rejects a bad signature", () => {
    const b = evt("payment_intent.succeeded", { id: "pi_1" });
    expect(stripeProvider.verifyWebhook(b, hdr(b, "other"))).toBeNull();
  });

  it("maps a succeeded payment intent to payment.succeeded in AED", () => {
    const b = evt("payment_intent.succeeded", { id: "pi_1", amount: 12550, currency: "aed", metadata: { orderNumber: "UAE-ABCDEFGH" } });
    expect(stripeProvider.verifyWebhook(b, hdr(b))).toMatchObject({ type: "payment.succeeded", orderNumber: "UAE-ABCDEFGH", providerRef: "pi_1", amount: 125.5, currency: "AED" });
  });

  it("maps a failed payment with its reason", () => {
    const b = evt("payment_intent.payment_failed", { id: "pi_1", amount: 100, currency: "aed", metadata: { orderNumber: "UAE-ABCDEFGH" }, last_payment_error: { message: "Your card was declined." } });
    expect(stripeProvider.verifyWebhook(b, hdr(b))).toMatchObject({ type: "payment.failed", reason: "Your card was declined." });
  });

  it("maps a succeeded refund (via its metadata) to refund.succeeded", () => {
    const b = evt("refund.updated", { id: "re_1", status: "succeeded", amount: 5000, currency: "aed", metadata: { orderNumber: "UAE-ABCDEFGH", providerRef: "pi_1" } });
    expect(stripeProvider.verifyWebhook(b, hdr(b))).toMatchObject({ type: "refund.succeeded", orderNumber: "UAE-ABCDEFGH", providerRef: "pi_1" });
  });

  it("acknowledges irrelevant events without an order number", () => {
    const b = evt("charge.updated", { id: "ch_1" });
    expect(stripeProvider.verifyWebhook(b, hdr(b))?.orderNumber).toBe("");
  });
});
