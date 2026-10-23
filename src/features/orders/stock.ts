import "server-only";
import { Types } from "mongoose";
import { InventoryMovement } from "@/models/inventory-movement";
import { Order } from "@/models/order";
import { Product } from "@/models/product";

type Item = { productId?: Types.ObjectId | string; sku?: string | null; qty?: number | null };

/**
 * Atomically take stock for one line. The stock check is part of the update filter, so two buyers can never both
 * take the last unit. Returns false if there isn't enough.
 */
export async function take(sku: string, qty: number) {
  const res = await Product.updateOne(
    { status: "active", mergedInto: null, variants: { $elemMatch: { sku, stock: { $gte: qty } } }, stock: { $gte: qty } },
    { $inc: { "variants.$.stock": -qty, stock: -qty, soldCount: qty } },
  );
  if (res.modifiedCount) return true;
  const plain = await Product.updateOne({ status: "active", mergedInto: null, sku, stock: { $gte: qty } }, { $inc: { stock: -qty, soldCount: qty } });
  return plain.modifiedCount > 0;
}

export async function give(sku: string, qty: number) {
  const res = await Product.updateOne({ "variants.sku": sku }, { $inc: { "variants.$.stock": qty, stock: qty, soldCount: -qty } });
  if (!res.modifiedCount) await Product.updateOne({ sku }, { $inc: { stock: qty, soldCount: -qty } });
}

/**
 * Reserve stock for all items. No multi-document transaction is used (works on standalone MongoDB): each line is an
 * atomic conditional update, and if a later line fails the earlier ones are put back (compensation).
 */
export async function reserveStock(orderId: Types.ObjectId, items: Item[]): Promise<{ ok: true } | { ok: false; sku: string }> {
  const taken: { sku: string; qty: number }[] = [];
  for (const it of items) {
    const sku = String(it.sku); const qty = Number(it.qty);
    if (await take(sku, qty)) taken.push({ sku, qty });
    else {
      for (const t of taken) await give(t.sku, t.qty);
      return { ok: false, sku };
    }
  }
  const prod = new Map(items.map((i) => [String(i.sku), i.productId]));
  await InventoryMovement.insertMany(taken.map((t) => ({ product: prod.get(t.sku), sku: t.sku, delta: -t.qty, reason: "order_placed", order: orderId })));
  await Order.updateOne({ _id: orderId }, { stockReserved: true });
  return { ok: true };
}

/** Put stock back exactly once (guarded by the stockReserved flag) — safe against double cancel/expiry. */
export async function releaseStock(orderId: Types.ObjectId, reason: "order_cancelled" | "order_expired", actor?: string) {
  const o = await Order.findOneAndUpdate({ _id: orderId, stockReserved: true }, { stockReserved: false }, { returnDocument: "before" }).lean();
  if (!o) return false;
  for (const it of o.items) await give(String(it.sku), Number(it.qty));
  await InventoryMovement.insertMany(o.items.map((it) => ({ product: it.productId, sku: it.sku, delta: it.qty, reason, order: orderId, actor: actor && Types.ObjectId.isValid(actor) ? actor : undefined })));
  return true;
}
