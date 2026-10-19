import { describe, expect, it } from "vitest";
import { tabbyPhone, tabbyProvider } from "@/lib/payments/tabby";

const hdr = (v: string) => new Headers({ "x-auth-key": v });
const body = (o: object) => JSON.stringify({ id: "pay_1", amount: "125.50", currency: "AED", order: { reference_id: "UAE-ABCDEFGH" }, ...o });

describe("tabby adapter", () => {
  process.env.TABBY_WEBHOOK_SECRET = "a-long-random-secret-value";
  const ok = hdr("a-long-random-secret-value");

  it("normalises UAE phone numbers", () => {
    expect(tabbyPhone("050 123 4567")).toBe("+971501234567");
    expect(tabbyPhone("971501234567")).toBe("+971501234567");
    expect(tabbyPhone("+971501234567")).toBe("+971501234567");
  });
  it("rejects a missing or wrong auth header", () => {
    expect(tabbyProvider.verifyWebhook(body({ status: "authorized" }), new Headers())).toBeNull();
    expect(tabbyProvider.verifyWebhook(body({ status: "authorized" }), hdr("nope"))).toBeNull();
  });
  it("maps authorized/closed to payment.succeeded", () => {
    expect(tabbyProvider.verifyWebhook(body({ status: "authorized" }), ok)).toMatchObject({ type: "payment.succeeded", orderNumber: "UAE-ABCDEFGH", providerRef: "pay_1", amount: 125.5, currency: "AED" });
    expect(tabbyProvider.verifyWebhook(body({ status: "closed", captures: [{ id: "c1" }] }), ok)?.type).toBe("payment.succeeded");
  });
  it("maps a closed payment with refunds to refund.succeeded, and rejected/expired to failures", () => {
    expect(tabbyProvider.verifyWebhook(body({ status: "closed", refunds: [{ id: "r1" }] }), ok)?.type).toBe("refund.succeeded");
    expect(tabbyProvider.verifyWebhook(body({ status: "rejected" }), ok)?.type).toBe("payment.failed");
    expect(tabbyProvider.verifyWebhook(body({ status: "expired" }), ok)?.type).toBe("payment.cancelled");
  });
  it("ignores other statuses (empty order number)", () => {
    expect(tabbyProvider.verifyWebhook(body({ status: "created" }), ok)?.orderNumber).toBe("");
  });
});
