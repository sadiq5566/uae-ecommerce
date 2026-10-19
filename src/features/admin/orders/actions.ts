"use server";
import { revalidatePath } from "next/cache";
import { FORBIDDEN, actor } from "@/lib/admin/guard";
import { audit } from "@/lib/admin/audit";
import { can } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db";
import { getProviderById } from "@/lib/payments";
import { updateOrderStatus } from "@/features/orders/lifecycle";
import { canTransition } from "@/features/orders/status";
import type { FormState } from "@/features/auth/schemas";
import { Order, ORDER_STATUSES, type OrderStatus } from "@/models/order";

const note = (fd: FormData) => String(fd.get("note") ?? "").trim().slice(0, 300);
const ERR: Record<string, string> = { invalid_transition: "That status change isn't allowed from the current status.", not_paid: "Only orders with collected payment can be refunded.", payment_required: "Payment hasn't been confirmed yet.", conflict: "The order changed while you were working — reload and try again.", not_found: "Order not found." };

export async function changeStatusAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor("orders:write");
  if (!user) return { error: FORBIDDEN };
  const number = String(fd.get("orderNumber") ?? ""); const to = String(fd.get("to") ?? "") as OrderStatus;
  if (!ORDER_STATUSES.includes(to)) return { error: "Choose a status." };
  const n = note(fd);
  if ((to === "cancelled" || to === "refund_pending") && !n) return { error: "A note (reason) is required for cancellations and refunds." };
  if (to === "refunded") return { error: "Use the refund controls below — refunds are only completed once confirmed." };
  const r = await updateOrderStatus({ orderNumber: number, to, actor: user.id, note: n || undefined });
  if (!r.ok) return { error: ERR[r.error] ?? "Couldn't update the order." };
  await audit(user, "order.status", "order", number, `Order ${number} → ${to}`, { note: n || undefined });
  revalidatePath(`/admin/orders/${number}`); revalidatePath("/admin/orders");
  return { ok: true };
}

/** Starts a refund. If the gateway adapter can refund, it is asked to; the order is only marked `refunded` when the provider confirms (webhook). */
export async function requestRefundAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor("orders:write");
  if (!user) return { error: FORBIDDEN };
  const number = String(fd.get("orderNumber") ?? ""); const n = note(fd);
  if (!n) return { error: "Enter the reason for the refund." };
  await connectDb();
  const order = await Order.findOne({ orderNumber: number }).lean();
  if (!order) return { error: "Order not found." };
  const r = await updateOrderStatus({ orderNumber: number, to: "refund_pending", actor: user.id, note: n });
  if (!r.ok) return { error: ERR[r.error] ?? "Couldn't start the refund." };
  let msg = "Refund started. It stays 'refund pending' until the payment provider confirms.";
  const provider = getProviderById(order.payment.provider);
  if (order.payment.method !== "cod" && order.payment.providerRef && provider?.refund) {
    const res = await provider.refund({ providerRef: order.payment.providerRef, amount: order.totals.total }).catch(() => ({ accepted: false }));
    await Order.updateOne({ orderNumber: number }, { $push: { timeline: { status: "refund_pending", at: new Date(), by: "system", note: res.accepted ? "Refund request accepted by provider — awaiting confirmation" : "Provider did not accept the refund request — process it in the gateway dashboard" } } });
    if (!res.accepted) msg = "Refund recorded, but the provider didn't accept the request — process it in the gateway dashboard.";
  }
  await audit(user, "order.refund_requested", "order", number, `Refund requested for ${number}`, { note: n });
  revalidatePath(`/admin/orders/${number}`); revalidatePath("/admin/orders");
  return { ok: true, values: { message: msg } };
}

/** Manual completion for refunds made outside the gateway (cash refunds for COD, or a bank transfer). Requires a reference note. */
export async function completeManualRefundAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor("orders:write");
  if (!user) return { error: FORBIDDEN };
  const number = String(fd.get("orderNumber") ?? ""); const n = note(fd);
  if (n.length < 5) return { error: "Enter a reference (e.g. bank transfer or receipt number)." };
  await connectDb();
  const order = await Order.findOne({ orderNumber: number }).lean();
  if (!order) return { error: "Order not found." };
  // Online-paid orders should be confirmed by the provider; only an owner may override with a manual reference.
  if (order.payment.method !== "cod" && !can(user.role, "users:manage")) return { error: "Refunds for online payments are completed when the payment provider confirms. Ask an owner to record a manual refund." };
  if (!canTransition(order.status, "refunded", order.payment.status).ok) return { error: ERR.invalid_transition };
  const r = await updateOrderStatus({ orderNumber: number, to: "refunded", actor: user.id, note: `Manual refund recorded: ${n}` });
  if (!r.ok) return { error: ERR[r.error] ?? "Couldn't update the order." };
  await audit(user, "order.refund_manual", "order", number, `Manual refund recorded for ${number}`, { note: n });
  revalidatePath(`/admin/orders/${number}`); revalidatePath("/admin/orders");
  return { ok: true };
}
