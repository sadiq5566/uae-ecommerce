import mongoose from "mongoose";
import { collections, faqs, products } from "../lib/seed";
import { FaqModel } from "../lib/models/Faq";
import { CollectionModel } from "../lib/models/Collection";
import { ProductModel } from "../lib/models/Product";

// Usage: npm run seed   (loads sample products + collections into MONGODB_URI; safe to re-run, matches by sku/slug)
async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (put it in .env.local)");
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || undefined });

  for (const p of products) {
    const { createdAt, ...rest } = p;
    await ProductModel.updateOne({ sku: p.sku }, { $set: rest, $setOnInsert: { createdAt: new Date(createdAt) } }, { upsert: true });
  }
  for (const c of collections) {
    await CollectionModel.updateOne({ slug: c.slug }, { $set: c }, { upsert: true });
  }
  for (const [i, f] of faqs.entries()) {
    await FaqModel.updateOne({ question: f.question }, { $set: { ...f, order: i } }, { upsert: true });
  }
  await ProductModel.syncIndexes();
  console.log(`Seeded ${products.length} products, ${collections.length} collections and ${faqs.length} FAQs.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
