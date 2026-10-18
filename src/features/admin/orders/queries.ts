import "server-only";
import { connectDb } from "@/lib/db";
import { escapeRe } from "@/lib/admin/common";
import { dayRange } from "@/lib/admin/list";
import { Order, ORDER_STATUSES, PAYMENT_STATUSES } from "@/models/order";

export const ORDER_SORTS = { placed: "createdAt", total: "totals.total", status: "status", order: "orderNumber", customer: "address.recipientName", emirate: "address.emirate", payment: "payment.status" } as const;
export type OrderFilters = { q: string; status: string; pay: string; method: string; emirate: string; source: string; guest: string; coupon: string; min: string; max: string; from: string; to: string };

export async function listOrdersAdmin(f: OrderFilters, sort: keyof typeof ORDER_SORTS, dir: 1 | -1, page: number, size = 25) {
  await connectDb();
  const m: Record<string, unknown> = {};
  if (f.q) { const re = new RegExp(escapeRe(f.q.slice(0, 60)), "i"); m.$or = [{ orderNumber: re }, { email: re }, { "address.recipientName": re }, { "address.phone": re }, { "items.sku": re }, { "items.name.en": re }]; }
  if (f.status && (ORDER_STATUSES as readonly string[]).includes(f.status)) m.status = f.status;
  if (f.pay && (PAYMENT_STATUSES as readonly string[]).includes(f.pay)) m["payment.status"] = f.pay;
  if (f.method) m["payment.method"] = f.method;
  if (f.emirate) m["address.emirate"] = f.emirate;
  if (f.source) m.source = f.source;
  if (f.guest === "guest") m.guest = true; else if (f.guest === "member") m.guest = { $ne: true };
  if (f.coupon === "used") m["coupon.code"] = { $exists: true, $ne: null };
  if (f.coupon === "none") m["coupon.code"] = { $in: [null, ""] };
  if (f.min || f.max) m["totals.total"] = { ...(f.min ? { $gte: Number(f.min) } : {}), ...(f.max ? { $lte: Number(f.max) } : {}) };
  const range = dayRange(f.from, f.to);
  if (range) m.createdAt = range;
  const [rows, total] = await Promise.all([Order.find(m).sort({ [ORDER_SORTS[sort]]: dir, _id: -1 }).skip((page - 1) * size).limit(size).lean(), Order.countDocuments(m)]);
  return { rows, total, pages: Math.max(1, Math.ceil(total / size)) };
}

export async function getOrderAdmin(orderNumber: string) {
  await connectDb();
  return Order.findOne({ orderNumber }).lean();
}
