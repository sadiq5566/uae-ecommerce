import "server-only";
import { connectDb } from "@/lib/db";
import { dubaiDay, eachDay, type Range } from "@/lib/admin/range";
import { AuditLog } from "@/models/audit-log";
import { Order, ORDER_STATUSES } from "@/models/order";
import { Product } from "@/models/product";
import { Review } from "@/models/review";

/** Orders that count as sales: paid online or accepted for COD, and not cancelled/refunded. Pending-payment orders are NOT sales. */
export const SALES_STATUSES = ["confirmed", "processing", "packed", "out_for_delivery", "delivered"] as const;

export async function getDashboard(r: Range) {
  await connectDb();
  const inRange = { createdAt: { $gte: r.from, $lte: r.to } };
  const salesMatch = { ...inRange, status: { $in: [...SALES_STATUSES] } };

  const [totals, byStatus, daily, best, lowStock, popular, viewed, recentOrders, recentAudit, pendingReviews, awaitingRefund] = await Promise.all([
    Order.aggregate([{ $match: salesMatch }, { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: "$totals.total" }, items: { $sum: { $sum: "$items.qty" } } } }]),
    Order.aggregate([{ $match: inRange }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    Order.aggregate([{ $match: salesMatch }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Dubai" } }, revenue: { $sum: "$totals.total" }, orders: { $sum: 1 } } }]),
    Order.aggregate([{ $match: salesMatch }, { $unwind: "$items" }, { $group: { _id: "$items.sku", name: { $first: "$items.name.en" }, qty: { $sum: "$items.qty" }, revenue: { $sum: "$items.lineTotal" } } }, { $sort: { qty: -1, revenue: -1 } }, { $limit: 5 }]),
    Product.find({ status: "active", $expr: { $lte: ["$stock", "$lowStockThreshold"] } }).sort({ stock: 1 }).limit(8).select("name sku stock lowStockThreshold").lean(),
    Product.find({ status: "active" }).sort({ soldCount: -1 }).limit(5).select("name sku soldCount").lean(),
    Product.find({ status: "active" }).sort({ viewCount: -1 }).limit(5).select("name sku viewCount").lean(),
    Order.find().sort({ createdAt: -1 }).limit(6).select("orderNumber status totals.total createdAt").lean(),
    AuditLog.find().sort({ createdAt: -1 }).limit(8).lean(),
    Review.countDocuments({ status: "pending" }),
    Order.countDocuments({ status: "refund_pending" }),
  ]);

  const t = totals[0] ?? { orders: 0, revenue: 0, items: 0 };
  const dayMap = new Map<string, { revenue: number; orders: number }>(daily.map((d) => [d._id as string, { revenue: d.revenue as number, orders: d.orders as number }]));
  const series = eachDay(r).map((day) => ({ day, revenue: dayMap.get(day)?.revenue ?? 0, orders: dayMap.get(day)?.orders ?? 0 }));
  const statusCounts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<(typeof ORDER_STATUSES)[number], number>;
  for (const s of byStatus) statusCounts[s._id as keyof typeof statusCounts] = s.n;

  return {
    orders: t.orders as number, revenue: t.revenue as number, items: t.items as number,
    aov: t.orders ? Math.round(((t.revenue as number) / (t.orders as number)) * 100) / 100 : 0,
    series, statusCounts, best, lowStock, popular, viewed, recentOrders, recentAudit, pendingReviews, awaitingRefund,
    today: dubaiDay(new Date()),
  };
}
