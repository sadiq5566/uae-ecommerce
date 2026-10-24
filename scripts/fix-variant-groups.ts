// Repairs "one product per size" duplicates for good.
//
// A product with colour/size variants (made by the CSV import, which groups supplier rows) owns the SKUs of all its variants. Older one-row-per-size
// products with those SKUs and the same name are leftovers: this marks each of them `mergedInto` = the main product's SKU and archives it.
// `mergedInto` is independent of `status`, and every shop query ignores such products, so a bulk "Set active" can never bring them back.
//
//   npm run db:fix-groups                 dry run: counts what would change, writes nothing
//   npm run db:fix-groups -- --apply      marks them (a backup of what changed is saved to scripts/fix-variant-groups.backup.json)
//   npm run db:fix-groups -- --restore    undoes the last --apply using that backup
//
// Safe to run any time and as often as you like: it only touches products that are still unmarked.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { ProductModel } from "../lib/models/Product";

// `npm run x --apply` (without the extra "--") reaches the script as an npm env var, not an argument: accept both.
const apply = process.argv.includes("--apply") || process.env.npm_config_apply === "true";
const restore = process.argv.includes("--restore");
const backupFile = path.join(process.cwd(), "scripts", "fix-variant-groups.backup.json");
const CHUNK = 1000;

type Main = { sku: string; name: string; variants?: { sku: string }[] };
type Doc = { _id: mongoose.Types.ObjectId; sku: string; name: string; status: string };

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI must be set (.env.local)");
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || undefined });

  if (restore) {
    const saved: { sku: string; status: string }[] = JSON.parse(await readFile(backupFile, "utf8"));
    for (let i = 0; i < saved.length; i += CHUNK) {
      const part = saved.slice(i, i + CHUNK);
      await ProductModel.bulkWrite(part.map((s) => ({ updateOne: { filter: { sku: s.sku }, update: { $set: { status: s.status }, $unset: { mergedInto: "" } } } })) as never, { ordered: false });
    }
    console.log(`Restored ${saved.length} product(s) to their previous status.`);
    return;
  }

  // Every product that has several variants and is not itself merged away.
  const mains = await ProductModel.find({ "variants.1": { $exists: true }, mergedInto: null }, { sku: 1, name: 1, "variants.sku": 1 }).lean<Main[]>();
  const owner = new Map<string, Main>(); // variant SKU -> the product that owns it
  for (const m of mains) for (const v of m.variants ?? []) if (v.sku !== m.sku) owner.set(v.sku, m);
  console.log(`${mains.length} product(s) with colour/size variants own ${owner.size} variant SKU(s) besides their own.\n`);

  const skus = [...owner.keys()];
  const todo: { doc: Doc; main: Main }[] = [];
  for (let i = 0; i < skus.length; i += CHUNK) {
    const docs = await ProductModel.find({ sku: { $in: skus.slice(i, i + CHUNK) }, "variants.1": { $exists: false }, mergedInto: null }, { sku: 1, name: 1, status: 1 }).lean<Doc[]>();
    for (const d of docs) {
      const m = owner.get(d.sku)!;
      if (d.name === m.name) todo.push({ doc: d, main: m }); // same name: it is the same product, one size/colour of it
    }
  }
  const byStatus: Record<string, number> = {};
  for (const t of todo) byStatus[t.doc.status] = (byStatus[t.doc.status] ?? 0) + 1;
  console.log(`${todo.length} one-size duplicate(s) still unmarked (by status: ${JSON.stringify(byStatus)}).`);
  if (!todo.length) console.log("Nothing to fix.");
  else if (!apply) console.log("\nDry run: nothing changed. Add --apply to mark them as merged and archive them.");
  else {
    await writeFile(backupFile, JSON.stringify(todo.map((t) => ({ sku: t.doc.sku, status: t.doc.status })), null, 1));
    for (let i = 0; i < todo.length; i += CHUNK) {
      const part = todo.slice(i, i + CHUNK);
      await ProductModel.bulkWrite(part.map((t) => ({ updateOne: { filter: { _id: t.doc._id, mergedInto: null }, update: { $set: { status: "archived", mergedInto: t.main.sku } } } })) as never, { ordered: false });
      process.stdout.write(`\r  ${Math.min(i + CHUNK, todo.length)}/${todo.length}`);
    }
    console.log(`\n\nDone: ${todo.length} product(s) marked as merged and archived (backup: scripts/fix-variant-groups.backup.json). Restart the site, or wait ~5 minutes for cached pages.`);
  }

  // Same-name products that are NOT variants of each other's SKUs cannot be merged safely from the database alone: just report them.
  const left = await ProductModel.aggregate([
    { $match: { status: "active", mergedInto: null } },
    { $group: { _id: { n: "$name", b: "$brand", c: "$category" }, k: { $sum: 1 } } },
    { $match: { k: { $gt: 1 } } },
    { $group: { _id: null, groups: { $sum: 1 }, products: { $sum: "$k" } } },
  ]);
  if (left[0]) console.log(`\nStill listed separately: ${left[0].groups} name group(s) / ${left[0].products} products share a name but are not variants of one another (different SKUs, no colour/size to tell them apart). Re-import their supplier CSV with npm run import-csv to group them.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
