import "server-only";
import { connectDb } from "@/lib/db";
import { Order, type OrderDoc } from "@/models/order";

export type OrderView = Omit<OrderDoc, "user" | "_id" | "items" | "timeline" | "idempotencyKey" | "stockReserved"> & {
  id: string; items: (Omit<OrderDoc["items"][number], "productId"> & { productId: string })[]; timeline: OrderDoc["timeline"];
};

const view = (o: OrderDoc): OrderView => {
  const { user: _u, _id, idempotencyKey: _k, stockReserved: _s, items, ...rest } = o;
  void _u; void _k; void _s;
  return JSON.parse(JSON.stringify({ ...rest, id: String(_id), items: items.map((i) => ({ ...i, productId: String(i.productId) })) }));
};

/** Ownership is part of the query: a customer can only ever load their own orders. */
export async function getOrderForUser(orderNumber: string, userId: string) {
  await connectDb();
  const o = await Order.findOne({ orderNumber, user: userId }).lean();
  return o ? view(o) : null;
}

export async function listOrdersForUser(userId: string, limit = 30) {
  await connectDb();
  const rows = await Order.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).lean();
  return rows.map(view);
}
