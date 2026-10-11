import "server-only";
import { connectDb } from "@/lib/db";
import { effectivePrice, Product } from "@/models/product";

/** Scheduled sales: recompute `finalPrice` for products with a sale window so sales start/end on time (finalPrice is stored for indexing). */
export async function refreshSalePrices(now = new Date()) {
  await connectDb();
  const rows = await Product.find({ $or: [{ saleStartsAt: { $ne: null } }, { saleEndsAt: { $ne: null } }] }).select("price salePrice saleStartsAt saleEndsAt finalPrice").limit(5000).lean();
  const ops = rows.filter((p) => effectivePrice(p, now) !== p.finalPrice).map((p) => ({ updateOne: { filter: { _id: p._id }, update: { $set: { finalPrice: effectivePrice(p, now) } } } }));
  if (ops.length) await Product.bulkWrite(ops);
  return { checked: rows.length, updated: ops.length };
}
