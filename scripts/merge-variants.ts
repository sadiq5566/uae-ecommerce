// Scraped catalogues often hold one product per colour / size ("... Black", "... Brown", "... 38", "... 40").
// This folds them into ONE product with colour / size variants (the way a shop shows them).
//
//   npm run db:merge-variants                dry run: lists the groups it would merge, writes nothing
//   npm run db:merge-variants -- --apply     merges; the merged-away products are archived (not deleted) and a backup goes to scripts/merge-variants.backup.json
//   --restore                                puts every product back exactly as it was before the last --apply (from the backup file)
//   --category=watches                       limit to one category
//
// Grouping rule: same brand + same category + same name once a trailing colour / size is removed (lib/variants.ts splitName).
// Rows that carry no colour or size, or two rows with the same colour+size, are never merged.
import { readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { ProductModel } from "../lib/models/Product";
import { groupKey, splitName } from "../lib/variants";
import { colorKey, normText, splitNameAny } from "../lib/variants-ar";

const apply = process.argv.includes("--apply") || process.env.npm_config_apply === "true";
const restore = process.argv.includes("--restore") || process.env.npm_config_restore === "true";
const BACKUP = path.join(process.cwd(), "scripts", "merge-variants.backup.json");
const category = process.argv.find((a) => a.startsWith("--category="))?.split("=")[1];

/** Imported variant values sometimes carry stray separators ("– ذهبي"): trim them. */
const clean = (v?: string) => v?.replace(/^[\s\-–—|/,:]+|[\s\-–—|/,:]+$/g, "") || undefined;

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Arabic name of the group: the main product's nameAr without its colour / size words. */
const arBase = (d: Doc) => (d.nameAr ? splitNameAny(d.nameAr, splitName).base : "");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI must be set");
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || undefined });

  if (restore) {
    const saved: Doc[] = JSON.parse(await readFile(BACKUP, "utf8"));
    for (const d of saved) await ProductModel.replaceOne({ _id: d._id }, d);
    console.log(`restored ${saved.length} product(s) from scripts/merge-variants.backup.json`);
    await mongoose.disconnect();
    return;
  }

  const docs = await ProductModel.find({ status: { $ne: "archived" }, ...(category ? { category } : {}) }).lean<Doc[]>();
  const groups = new Map<string, { doc: Doc; color?: string; size?: string; base: string }[]>();
  for (const doc of docs) {
    if (doc.variants?.length > 1) continue; // already a multi-variant product
    const s = splitNameAny(doc.name, splitName); // English and Arabic names (colour / size words in either language)
    const color = clean(s.color ?? doc.variants?.[0]?.color);
    const size = clean(s.size ?? doc.variants?.[0]?.size);
    if (!color && !size) continue;
    const key = `${doc.category}|${groupKey(doc.brand, s.base)}`;
    groups.set(key, [...(groups.get(key) ?? []), { doc, color, size, base: s.base }]);
  }

  // The same colour + size listed twice (two uploads of one product) counts once: the richer copy is kept and the other is archived as a duplicate.
  type Member = { doc: Doc; color?: string; size?: string; base: string };
  const richer = (a: Member, b: Member) => (b.doc.images?.length ?? 0) - (a.doc.images?.length ?? 0) || (b.doc.stock ?? 0) - (a.doc.stock ?? 0) || +new Date(a.doc.createdAt) - +new Date(b.doc.createdAt);
  const merges = [...groups.values()].map((g) => {
    const byCombo = new Map<string, Member[]>();
    for (const m of g) { const k = `${colorKey(m.color)}|${normText(m.size)}`; byCombo.set(k, [...(byCombo.get(k) ?? []), m]); } // "أسود" and "Black" are the same colour
    const keep: Member[] = [], dupes: Member[] = [];
    for (const list of byCombo.values()) { const [best, ...rest] = [...list].sort(richer); keep.push(best); dupes.push(...rest); }
    return { keep, dupes };
  }).filter((g) => g.keep.length >= 2); // a real product needs at least two different colours / sizes

  let removed = 0;
  const backup: Doc[] = [];
  for (const g of merges) {
    const sorted = [...g.keep].sort((a, b) => (b.doc.images?.length ?? 0) - (a.doc.images?.length ?? 0) || +new Date(a.doc.createdAt) - +new Date(b.doc.createdAt));
    const [main, ...rest] = sorted;
    const archived = [...rest, ...g.dupes];
    const variants = sorted.map((m) => ({
      sku: m.doc.sku, color: m.color, size: m.size,
      ...(m.doc.priceTo !== main.doc.priceTo ? { price: m.doc.priceTo } : {}),
      stock: m.doc.stock ?? 0, image: m.doc.images?.[0]?.url,
    }));
    console.log(`${main.base}  (${g.keep.length}${g.dupes.length ? ` +${g.dupes.length} duplicate${g.dupes.length === 1 ? "" : "s"}` : ""}) → ${variants.map((v) => [v.color, v.size].filter(Boolean).join(" ")).join(", ")}`);
    removed += archived.length;
    if (!apply) continue;
    backup.push(...sorted.map((m) => m.doc), ...g.dupes.map((m) => m.doc));
    const images = [...new Map(sorted.flatMap((m) => m.doc.images ?? []).map((i: Doc) => [i.url, i])).values()].slice(0, 12);
    await ProductModel.updateOne({ _id: main.doc._id }, {
      $set: { name: main.base, model: main.base, ...(arBase(main.doc) && { nameAr: arBase(main.doc) }), variants, stock: variants.reduce((s, v) => s + v.stock, 0), images },
      $addToSet: { slugHistory: { $each: archived.map((m) => m.doc.slug) } },
    });
    await ProductModel.updateMany({ _id: { $in: archived.map((m) => m.doc._id) } }, { $set: { status: "archived", mergedInto: main.doc.sku } });
  }

  console.log(`\n${merges.length} group(s), ${removed} product(s) ${apply ? "merged into their group" : "would be archived"}.${apply ? "" : " Run with --apply to do it."}`);
  if (apply && backup.length) {
    if (existsSync(BACKUP)) await rename(BACKUP, BACKUP.replace(".json", `.${Date.now()}.json`)); // keep the earlier run's backup too
    await writeFile(BACKUP, JSON.stringify(backup, null, 1));
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
