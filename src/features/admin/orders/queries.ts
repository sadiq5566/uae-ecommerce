import "server-only";
import { connectDb } from "@/lib/db";
import { escapeRe } from "@/lib/admin/common";
import { Order, ORDER_STATUSES, PAYMENT_STATUSES } from "@/models/order";

export async function listOrdersAdmin(q: { q?: string; status?: string; pay?: string; from?: string; to?: string; page: number }, size = 20) {
  await connectDb();
  const f: Record<string, unknown> = {};
  if (q.q) { const re = new RegExp(escapeRe(q.q.slice(0, 60)), "i"); f.$or = [{ orderNumber: re }, { email: re }, { "address.recipientName": re }, { "address.phone": re }]; }
  if (q.status && (ORDER_STATUSES as readonly string[]).includes(q.status)) f.status = q.status;
  if (q.pay && (PAYMENT_STATUSES as readonly string[]).includes(q.pay)) f["payment.status"] = q.pay;
  const date = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(s) - 4 * 3600_000 : null);
  const from = date(q.from), to = date(q.to);
  if (from !== null || to !== null) f.createdAt = { ...(from !== null && { $gte: new Date(from) }), ...(to !== null && { $lte: new Date(to + 24 * 3600_000 - 1) }) };
  const [rows, total] = await Promise.all([Order.find(f).sort({ createdAt: -1 }).skip((q.page - 1) * size).limit(size).lean(), Order.countDocuments(f)]);
  return { rows, total, pages: Math.max(1, Math.ceil(total / size)) };
}

export async function getOrderAdmin(orderNumber: string) {
  await connectDb();
  return Order.findOne({ orderNumber }).lean();
}
