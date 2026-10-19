import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { connectDb } from "@/lib/db";
import { Order, type OrderDoc } from "@/models/order";
import { Product } from "@/models/product";

export type OrderView = Omit<OrderDoc, "user" | "_id" | "items" | "timeline" | "idempotencyKey" | "stockReserved" | "trackToken" | "cartGuestId"> & {
  id: string; items: (Omit<OrderDoc["items"][number], "productId"> & { productId: string })[]; timeline: OrderDoc["timeline"];
};

const view = (o: OrderDoc): OrderView => {
  const { user: _u, _id, idempotencyKey: _k, stockReserved: _s, trackToken: _t, cartGuestId: _c, items, ...rest } = o;
  void _u; void _k; void _s; void _t; void _c;
  return JSON.parse(JSON.stringify({ ...rest, id: String(_id), items: items.map((i) => ({ ...i, productId: String(i.productId) })) }));
};

/** sku → picture URL for order/return lines (colour option's own picture first, then the product's first picture). */
export async function itemImageMap(items: { sku: string; image?: string | null }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const need = items.filter((i) => !i.image).map((i) => i.sku);
  for (const i of items) if (i.image) out.set(i.sku, i.image);
  if (!need.length) return out;
  await connectDb();
  const ps = await Product.find({ $or: [{ sku: { $in: need } }, { "variants.sku": { $in: need } }] }).select("sku images variants.sku variants.image").lean();
  for (const sku of need) {
    const p = ps.find((x) => x.sku === sku || x.variants?.some((v) => v.sku === sku));
    const url = p?.variants?.find((v) => v.sku === sku)?.image || p?.images?.[0]?.url;
    if (url) out.set(sku, url);
  }
  return out;
}

/** Orders placed before pictures were stored get the product's current picture (the chosen colour option's picture when it has one). */
async function withImages<T extends OrderView | null>(o: T): Promise<T> {
  if (!o) return o;
  const missing = o.items.filter((i) => !i.image).map((i) => i.productId);
  if (!missing.length) return o;
  const ps = await Product.find({ _id: { $in: missing } }).select("images variants.sku variants.image").lean();
  const byId = new Map(ps.map((p) => [String(p._id), p]));
  for (const i of o.items) {
    if (i.image) continue;
    const p = byId.get(i.productId);
    i.image = p?.variants?.find((v) => v.sku === i.sku)?.image || p?.images?.[0]?.url || undefined;
  }
  return o;
}

/** Ownership is part of the query: a customer can only ever load their own orders. */
export async function getOrderForUser(orderNumber: string, userId: string) {
  await connectDb();
  const o = await Order.findOne({ orderNumber, user: userId }).lean();
  return o ? withImages(view(o)) : null;
}

export async function listOrdersForUser(userId: string, limit = 30) {
  await connectDb();
  const rows = await Order.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).lean();
  return Promise.all(rows.map((r) => withImages(view(r))));
}

const sameToken = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Guest/shared tracking: the order is only returned to someone holding its secret token. */
export async function getOrderByToken(orderNumber: string, token: string) {
  await connectDb();
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token) || !/^UAE-[A-Z0-9]{8}$/.test(orderNumber)) return null;
  const o = await Order.findOne({ orderNumber }).lean();
  if (!o?.trackToken || !sameToken(o.trackToken, token)) return null;
  return withImages(view(o));
}

/** Order number + the phone it was delivered to → the tracking token (created on demand for older orders). */
export async function findTrackToken(orderNumber: string, phone: string): Promise<string | null> {
  await connectDb();
  const o = await Order.findOne({ orderNumber: orderNumber.trim().toUpperCase(), "address.phone": phone }).select("trackToken").lean();
  if (!o) return null;
  if (o.trackToken) return o.trackToken;
  const token = randomBytes(18).toString("base64url");
  await Order.updateOne({ _id: o._id, trackToken: { $exists: false } }, { $set: { trackToken: token } });
  return (await Order.findById(o._id).select("trackToken").lean())?.trackToken ?? null;
}
