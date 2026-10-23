// Scraped catalogues often hold one product per colour / size ("... Black", "... Brown", "... 38", "... 40").
// This folds them into ONE product with colour / size variants (the way a shop shows them).
//
//   npm run db:merge-variants                dry run: lists the groups it would merge, writes nothing
//   npm run db:merge-variants -- --apply     merges; the merged-away products are archived (not deleted) and a backup goes to scripts/merge-variants.backup.json
//   --category=watches                       limit to one category
//
// Grouping rule: same brand + same category + same name once a trailing colour / size is removed (lib/variants.ts splitName).
// Rows that carry no colour or size, or two rows with the same colour+size, are never merged.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { ProductModel } from "../lib/models/Product";
import { groupKey, splitName } from "../lib/variants";

const apply = process.argv.includes("--apply");
const category = process.argv.find((a) => a.startsWith("--category="))?.split("=")[1];

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI must be set");
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || undefined });

  const docs = await ProductModel.find({ status: { $ne: "archived" }, ...(category ? { category } : {}) }).lean<Doc[]>();
  const groups = new Map<string, { doc: Doc; color?: string; size?: string; base: string }[]>();
  for (const doc of docs) {
    if (doc.variants?.length > 1) continue; // already a multi-variant product
    const s = splitName(doc.name);
    const color = s.color ?? doc.variants?.[0]?.color;
    const size = s.size ?? doc.variants?.[0]?.size;
    if (!color && !size) continue;
    const key = `${doc.category}|${groupKey(doc.brand, s.base)}`;
    groups.set(key, [...(groups.get(key) ?? []), { doc, color, size, base: s.base }]);
  }

  const merges = [...groups.values()].filter((g) => {
    if (g.length < 2) return false;
    const combos = new Set(g.map((m) => `${m.color ?? ""}|${m.size ?? ""}`));
    return combos.size === g.length; // every member must differ by colour/size
  });

  let removed = 0;
  const backup: Doc[] = [];
  for (const g of merges) {
    const sorted = [...g].sort((a, b) => (b.doc.images?.length ?? 0) - (a.doc.images?.length ?? 0) || +new Date(a.doc.createdAt) - +new Date(b.doc.createdAt));
    const [main, ...rest] = sorted;
    const variants = sorted.map((m) => ({
      sku: m.doc.sku, color: m.color, size: m.size,
      ...(m.doc.priceTo !== main.doc.priceTo ? { price: m.doc.priceTo } : {}),
      stock: m.doc.stock ?? 0, image: m.doc.images?.[0]?.url,
    }));
    console.log(`${main.base}  (${g.length}) → ${variants.map((v) => [v.color, v.size].filter(Boolean).join(" ")).join(", ")}`);
    removed += rest.length;
    if (!apply) continue;
    backup.push(...g.map((m) => m.doc));
    const images = [...new Map(sorted.flatMap((m) => m.doc.images ?? []).map((i: Doc) => [i.url, i])).values()].slice(0, 12);
    await ProductModel.updateOne({ _id: main.doc._id }, {
      $set: { name: main.base, model: main.base, variants, stock: variants.reduce((s, v) => s + v.stock, 0), images },
      $addToSet: { slugHistory: { $each: rest.map((m) => m.doc.slug) } },
    });
    await ProductModel.updateMany({ _id: { $in: rest.map((m) => m.doc._id) } }, { $set: { status: "archived", mergedInto: main.doc.sku } });
  }

  console.log(`\n${merges.length} group(s), ${removed} product(s) ${apply ? "merged into their group" : "would be archived"}.${apply ? "" : " Run with --apply to do it."}`);
  if (apply && backup.length) await writeFile(path.join(process.cwd(), "scripts", "merge-variants.backup.json"), JSON.stringify(backup, null, 1));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
