// Raises every product's selling price by a percentage. Dry run unless --apply is given.
//   npm run db:markup -- 10                 report what a 10% increase would do
//   npm run db:markup -- 10 --apply         writes it
//   npm run db:markup -- 10 --keep-was      same, but the crossed-out "was" price is left alone (see below)
//   npm run db:markup -- --restore          puts the original prices back (add --apply to write)
// The first --apply saves the untouched prices to scripts/markup.backup.json. Every later run (10, then 20 ...) is worked out from
// those saved prices, so rises never stack: running 20 after 10 gives +20% on the original, not +32%.
// Selling price = priceTo and variants[].price. The crossed-out "was" price (priceFrom) rises by the same percentage, so the discount % the
// shop shows stays the same. With --keep-was priceFrom stays as it is (it only moves up when it would end below the new selling price),
// so the shown discount shrinks.
// This is the opposite of db:discount. Both keep their own backup, so restore one (db:discount -- --restore --apply) before using the other.
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { ProductModel } from "../lib/models/Product";

// The shared model type is a union that TypeScript cannot call directly; the script only needs find / bulkWrite.
const Product = ProductModel as unknown as mongoose.Model<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const BACKUP = path.join(__dirname, "markup.backup.json");
const OTHER_BACKUP = path.join(__dirname, "discount.backup.json");
type Saved = Record<string, { priceFrom?: number; priceTo?: number; variants: Record<string, number | undefined> }>;

const apply = process.argv.includes("--apply") || process.env.npm_config_apply === "true";
const restore = process.argv.includes("--restore") || process.env.npm_config_restore === "true";
const keepWas = process.argv.includes("--keep-was") || process.env.npm_config_keep_was === "true";
const pctArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const pct = Number(pctArg);
const round2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  if (!restore && (!pctArg || !Number.isFinite(pct) || pct <= 0 || pct > 500)) {
    console.error("Usage: npm run db:markup -- <percent 1-500> [--apply] [--keep-was]   |   npm run db:markup -- --restore [--apply]");
    process.exit(1);
  }
  if (!restore && fs.existsSync(OTHER_BACKUP)) {
    console.error("A price cut from db:discount is still active (scripts/discount.backup.json). Run `npm run db:discount -- --restore --apply` first, so the two never mix.");
    process.exit(1);
  }
  const saved: Saved = fs.existsSync(BACKUP) ? JSON.parse(fs.readFileSync(BACKUP, "utf8")) : {};
  if (restore && !Object.keys(saved).length) { console.error("No backup found (scripts/markup.backup.json): nothing to restore."); process.exit(1); }

  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB || undefined });
  const products = (await Product.find({}).select("sku priceFrom priceTo variants").lean()) as unknown as { _id: unknown; sku: string; priceFrom?: number; priceTo?: number; variants?: { sku: string; price?: number }[] }[];
  const ops: Parameters<typeof Product.bulkWrite>[0] = [];
  const next: Saved = { ...saved };
  let sample = 0;

  for (const p of products) {
    if (!restore && !saved[p.sku]) next[p.sku] = { priceFrom: p.priceFrom, priceTo: p.priceTo, variants: Object.fromEntries((p.variants ?? []).map((v) => [v.sku, v.price])) };
    const base = restore ? saved[p.sku] : next[p.sku];
    if (!base) continue;
    const factor = restore ? 1 : 1 + pct / 100;
    const $set: Record<string, number | undefined> = {};
    const priceTo = base.priceTo == null ? undefined : restore ? base.priceTo : round2(base.priceTo * factor);
    if (priceTo != null) $set.priceTo = priceTo;
    if (base.priceFrom != null) {
      if (restore) $set.priceFrom = base.priceFrom;
      else if (keepWas) $set.priceFrom = Math.max(base.priceFrom, priceTo ?? 0); // never below the selling price
      else $set.priceFrom = round2(base.priceFrom * factor);
    }
    (p.variants ?? []).forEach((v, i) => {
      const old = base.variants[v.sku];
      if (old != null) $set[`variants.${i}.price`] = restore ? old : round2(old * factor);
    });
    if (sample++ < 5) console.log(`  ${p.sku}: ${p.priceTo} -> ${$set.priceTo}${base.priceFrom != null ? `  (was ${p.priceFrom} -> ${$set.priceFrom})` : ""}`);
    ops.push({ updateOne: { filter: { _id: p._id }, update: { $set } } });
  }

  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${restore ? "restore original prices" : `+${pct}%${keepWas ? " (was price kept)" : ""}`} on ${ops.length} of ${products.length} products`);
  if (!apply) console.log("dry run: nothing written. Re-run with --apply.");
  else if (ops.length) {
    if (!restore) fs.writeFileSync(BACKUP, JSON.stringify(next, null, 1)); // backup first, then write
    await Product.bulkWrite(ops);
    if (restore) fs.unlinkSync(BACKUP);
    console.log("done");
  }
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
