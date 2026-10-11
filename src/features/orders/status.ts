import type { OrderStatus, PaymentStatus } from "@/models/order";

/** Allowed order status transitions. Anything not listed is rejected. */
export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["packed", "cancelled"],
  packed: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "refund_pending"], // failed/returned delivery → refund (if paid)
  delivered: ["refund_pending"],
  cancelled: ["refund_pending"], // only when the order had been paid (see canTransition)
  refund_pending: ["refunded"],
  refunded: [],
};

/** Statuses after which stock goes back on the shelf when entered from a pre-delivery state. */
export const RELEASES_STOCK: readonly OrderStatus[] = ["cancelled"];

export const isPaid = (p: PaymentStatus) => p === "paid" || p === "cod_collected";

export function canTransition(from: OrderStatus, to: OrderStatus, payment: PaymentStatus): { ok: boolean; reason?: string } {
  if (!TRANSITIONS[from].includes(to)) return { ok: false, reason: "invalid_transition" };
  // Refunds only make sense once money was actually collected.
  if (to === "refund_pending" && !isPaid(payment)) return { ok: false, reason: "not_paid" };
  // A COD order can't be marked delivered-and-closed without staff noting collection (handled by the service), and
  // card orders can't move forward until payment is confirmed.
  if (from === "pending_payment" && to === "confirmed" && payment !== "paid" && payment !== "cod_pending") return { ok: false, reason: "payment_required" };
  return { ok: true };
}

export const nextStatuses = (from: OrderStatus, payment: PaymentStatus) => TRANSITIONS[from].filter((to) => canTransition(from, to, payment).ok);
