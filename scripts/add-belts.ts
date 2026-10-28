// Moves every belt out of "accessories"/"general" into its own "belts" category and creates the category page (with SEO text).
//   npm run db:add-belts            report only
//   npm run db:add-belts -- --apply backs up the affected products to ./backups, then writes
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { categoryCopy, SEO_LABEL } from "../lib/seo-copy";

const apply = process.argv.includes("--apply") || process.env.npm_config_apply === "true";
const BELT = /\bbelts?\b|حزام|أحزمة/i;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB || undefined });
  const db = mongoose.connection.db!, col = db.collection("products");
  const rows = (await col.find({ category: { $in: ["accessories", "general"] } }, { projection: { name: 1, nameAr: 1, brand: 1, category: 1, subcategory: 1, tags: 1 } }).toArray())
    .filter((p) => BELT.test([p.name, p.nameAr, p.subcategory, ...(p.tags ?? [])].filter(Boolean).join(" ")));
  const brands = new Map<string, number>(); for (const p of rows) brands.set(p.brand, (brands.get(p.brand) ?? 0) + 1);
  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${rows.length} belts found`, Object.fromEntries(brands), rows.slice(0, 4).map((p) => p.name));
  if (!rows.length) return;
  if (apply) {
    const dir = path.join(process.cwd(), "backups"); await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `belts-before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), JSON.stringify(rows));
    await col.updateMany({ _id: { $in: rows.map((p) => p._id) } }, { $set: { category: "belts", updatedAt: new Date() } });
    const cc = categoryCopy(SEO_LABEL.belts, [...brands].sort((a, b) => b[1] - a[1]).map(([b]) => b), rows.length);
    await db.collection("collections").updateOne({ slug: "all-belts" }, {
      $set: { "seo.title": cc.title, "seo.description": cc.description, description: cc.intro },
      $setOnInsert: { slug: "all-belts", name: "Belts", image: "", type: "category", parent: "belts", sortOrder: 50 },
    }, { upsert: true });
    console.log("done: category 'belts' created with", rows.length, "products");
  } else console.log("dry run: nothing written. Re-run with --apply.");
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
