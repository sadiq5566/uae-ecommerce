import { describe, expect, it, vi } from "vitest";
import { ORDER_STATUSES } from "@/models/order";
import { canTransition, nextStatuses, TRANSITIONS } from "@/features/orders/status";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, sign, verifySignature } from "@/lib/payments/signature";

describe("order status machine", () => {
  it("covers every status", () => expect(Object.keys(TRANSITIONS).sort()).toEqual([...ORDER_STATUSES].sort()));
  it("allows the happy path", () => {
    const path = ["pending_payment", "confirmed", "processing", "packed", "out_for_delivery", "delivered"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1], i === 0 ? "paid" : "paid").ok).toBe(true);
  });
  it("rejects skipping steps and going backwards", () => {
    expect(canTransition("confirmed", "delivered", "paid").ok).toBe(false);
    expect(canTransition("delivered", "processing", "paid").ok).toBe(false);
    expect(canTransition("packed", "confirmed", "paid").ok).toBe(false);
  });
  it("terminal states have no exits", () => {
    expect(nextStatuses("refunded", "refunded")).toEqual([]);
  });
  it("can't confirm an online order until payment is confirmed", () => {
    expect(canTransition("pending_payment", "confirmed", "pending")).toEqual({ ok: false, reason: "payment_required" });
    expect(canTransition("pending_payment", "confirmed", "failed").ok).toBe(false);
    expect(canTransition("pending_payment", "confirmed", "paid").ok).toBe(true);
    expect(canTransition("pending_payment", "confirmed", "cod_pending").ok).toBe(true);
  });
  it("only refunds money that was collected", () => {
    expect(canTransition("delivered", "refund_pending", "cod_pending")).toEqual({ ok: false, reason: "not_paid" });
    expect(canTransition("delivered", "refund_pending", "cod_collected").ok).toBe(true);
    expect(canTransition("cancelled", "refund_pending", "paid").ok).toBe(true);
    expect(canTransition("cancelled", "refund_pending", "pending").ok).toBe(false);
  });
  it("cancellation is possible only before dispatch", () => {
    for (const s of ["pending_payment", "confirmed", "processing", "packed"] as const) expect(canTransition(s, "cancelled", "paid").ok).toBe(true);
    for (const s of ["out_for_delivery", "delivered", "refunded"] as const) expect(canTransition(s, "cancelled", "paid").ok).toBe(false);
  });
});

describe("webhook signature", () => {
  const secret = "a-long-test-secret-value";
  const body = JSON.stringify({ id: "evt_1" });
  const now = 1_700_000_000_000;
  const ts = String(now);
  it("accepts a valid signature", () => expect(verifySignature(secret, body, sign(secret, ts, body), ts, now)).toBe(true));
  it("rejects a tampered body, wrong secret, missing parts", () => {
    expect(verifySignature(secret, body + " ", sign(secret, ts, body), ts, now)).toBe(false);
    expect(verifySignature("other-secret-value-xx", body, sign(secret, ts, body), ts, now)).toBe(false);
    expect(verifySignature(secret, body, null, ts, now)).toBe(false);
    expect(verifySignature(secret, body, sign(secret, ts, body), null, now)).toBe(false);
    expect(verifySignature("", body, sign("", ts, body), ts, now)).toBe(false);
  });
  it("rejects malformed signatures without throwing", () => {
    expect(verifySignature(secret, body, "zz-not-hex", ts, now)).toBe(false);
    expect(verifySignature(secret, body, "abcd", ts, now)).toBe(false);
  });
  it("rejects replays outside the time window", () => {
    expect(verifySignature(secret, body, sign(secret, ts, body), ts, now + 6 * 60_000)).toBe(false);
    expect(verifySignature(secret, body, sign(secret, ts, body), ts, now + 4 * 60_000)).toBe(true);
  });
  it("exposes header names", () => { expect(SIGNATURE_HEADER).toBe("x-signature"); expect(TIMESTAMP_HEADER).toBe("x-timestamp"); vi.fn(); });
});
