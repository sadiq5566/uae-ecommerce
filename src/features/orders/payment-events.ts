import "server-only";
import { connectDb } from "@/lib/db";
import { getProvider, getProviderById } from "@/lib/payments";
import type { PaymentEvent, PaymentProvider } from "@/lib/payments/types";
import { Cart } from "@/models/cart";
import { Order } from "@/models/order";
import { WebhookEvent } from "@/models/webhook-event";
import { toFils } from "@/features/checkout/money";
import { updateOrderStatus } from "./lifecycle";
import { notifyOrder } from "./notify";

export type EventResult = "processed" | "duplicate" | "ignored" | "rejected_mismatch" | "order_not_found";

/**
 * Apply a VERIFIED provider event to an order, exactly once. The browser redirect never marks an order paid —
 * only this function does, and only for events that passed signature verification.
 */
export async function processPaymentEvent(providerId: string, e: PaymentEvent): Promise<EventResult> {
  await connectDb();
  // Idempotency: the unique (provider, eventId) index makes the second delivery of the same event a no-op.
  try {
    await WebhookEvent.create({ provider: providerId, eventId: e.id, type: e.type });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return "duplicate";
    throw err;
  }
  const mark = (outcome: "processed" | "ignored" | "rejected", note?: string, order?: unknown) =>
    WebhookEvent.updateOne({ provider: providerId, eventId: e.id }, { outcome, note, ...(order ? { order } : {}) });

  const order = await Order.findOne({ orderNumber: e.orderNumber }).lean();
  if (!order) { await mark("ignored", "order not found"); return "order_not_found"; }
  if (order.payment.method === "cod") { await mark("ignored", "cod order"); return "ignored"; }
  if (order.payment.providerRef && order.payment.providerRef !== e.providerRef) { await mark("rejected", "providerRef mismatch", order._id); return "rejected_mismatch"; }

  if (e.type === "payment.succeeded") {
    // Never trust the event alone: amount and currency must match what we charged.
    if (e.currency !== (order.totals.currency ?? "AED") || toFils(e.amount) !== toFils(order.totals.total ?? 0)) {
      await Order.updateOne({ _id: order._id }, { $push: { timeline: { status: order.status, at: new Date(), by: "system", note: `Payment event amount mismatch (${e.amount} ${e.currency}) — not marked paid` } } });
      await mark("rejected", "amount mismatch", order._id);
      return "rejected_mismatch";
    }
    const paid = { "payment.status": "paid", "payment.paidAt": new Date(), "payment.providerRef": e.providerRef };
    if (order.status === "pending_payment") {
      const claimed = await Order.findOneAndUpdate({ _id: order._id, status: "pending_payment" }, { $set: paid, $unset: { expiresAt: 1 } }, { returnDocument: "after" }).lean();
      if (claimed) {
        const r = await updateOrderStatus({ orderNumber: order.orderNumber, to: "confirmed", actor: "payment", note: `Payment confirmed (${providerId})`, notify: false });
        if (r.ok) await notifyOrder(r.order, "confirmation");
        if (order.source === "cart") await Cart.updateOne(order.user ? { user: order.user } : order.cartGuestId ? { guestId: order.cartGuestId } : { _id: null }, { $set: { items: [] } });
      }
    } else if (order.status === "cancelled") {
      // Paid after the order was cancelled/expired: record the money and queue a refund instead of fulfilling.
      await Order.updateOne({ _id: order._id }, { $set: paid });
      await updateOrderStatus({ orderNumber: order.orderNumber, to: "refund_pending", actor: "payment", note: "Payment received after cancellation — refund required", notify: false });
    } else {
      await Order.updateOne({ _id: order._id }, { $set: paid });
    }
  } else if (e.type === "payment.failed" || e.type === "payment.cancelled") {
    if (order.payment.status !== "paid") {
      await Order.updateOne({ _id: order._id }, { $set: { "payment.status": "failed", "payment.failureReason": e.reason ?? e.type }, $push: { timeline: { status: order.status, at: new Date(), by: "payment", note: `Payment ${e.type === "payment.failed" ? "failed" : "cancelled"}${e.reason ? `: ${e.reason}` : ""}` } } });
      await notifyOrder(order, "payment_failed");
    }
  } else if (e.type === "refund.succeeded") {
    if (order.status !== "refunded") {
      if (order.status !== "refund_pending") {
        const r = await updateOrderStatus({ orderNumber: order.orderNumber, to: "refund_pending", actor: "payment", note: "Refund initiated at provider", notify: false });
        if (!r.ok) { await Order.updateOne({ _id: order._id }, { $set: { "payment.status": "refund_pending" } }); }
      }
      await updateOrderStatus({ orderNumber: order.orderNumber, to: "refunded", actor: "payment", note: "Refund confirmed by provider" });
    }
  }
  await mark("processed", undefined, order._id);
  return "processed";
}

/** Verify + process a raw webhook request. Shared by the real route and the mock pay page. */
export async function handleWebhook(rawBody: string, headers: Headers, providerId?: string): Promise<{ status: number; body: string }> {
  const provider: PaymentProvider | null = providerId ? getProviderById(providerId) : getProvider();
  if (!provider) return { status: 404, body: "no payment provider" };
  let event = provider.verifyWebhook(rawBody, headers);
  if (!event) return { status: 400, body: "invalid signature" }; // log nothing from the body: it is untrusted
  if (provider.confirmEvent) {
    try { event = await provider.confirmEvent(event); } catch { return { status: 503, body: "confirmation failed" }; } // non-2xx: the provider retries
    if (!event) return { status: 400, body: "not confirmed" };
  }
  const result = await processPaymentEvent(provider.id, event);
  return { status: 200, body: result };
}
