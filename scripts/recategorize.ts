// Usage: npm run db:recategorize
// Folds messy categories (bag, handbags, shoulder-bags, general...) into clean ones using the name, category, subcategory and tags.
import mongoose from "mongoose";
import { resolveCategory } from "../lib/category";

// One-off clean-up: anything outside these is re-classified from the product text (falls back to "general").
const KEEP = new Set(["watches", "jewelry", "bags", "perfume", "accessories"]);

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB || undefined });
  const col = mongoose.connection.db!.collection("products");
  const ops: mongoose.mongo.AnyBulkWriteOperation[] = [];
  const counts: Record<string, number> = {};
  for await (const p of col.find({}, { projection: { name: 1, category: 1, subcategory: 1, tags: 1 } })) {
    const hint = [p.name, p.category, p.subcategory, ...(p.tags ?? [])].filter(Boolean).join(" ").replace(/[-_]+/g, " ");
    const next = resolveCategory(KEEP.has(p.category) ? p.category : "", hint);
    counts[next] = (counts[next] ?? 0) + 1;
    if (next !== p.category) ops.push({ updateOne: { filter: { _id: p._id }, update: { $set: { category: next } } } });
  }
  if (ops.length) await col.bulkWrite(ops);
  console.log(`updated ${ops.length} products`, counts);
  await mongoose.disconnect();
}
main();
