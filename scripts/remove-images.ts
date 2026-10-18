// Removes unwanted images (product gallery + colour/size option pictures) whose URL contains any IMAGE_BLOCKLIST word.
// Usage:  npm run remove-images                       (dry run, uses IMAGE_BLOCKLIST from .env.local)
//         npm run remove-images -- --apply            (does it)
//         npm run remove-images -- word1,word2 --apply (explicit words instead of IMAGE_BLOCKLIST)
// Removed URLs per product are saved to scripts/remove-images.backup.json so they can be restored.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { Product } from "../src/models/product";

import { escapeRe } from "../src/lib/admin/common";

const apply = process.argv.includes("--apply");
const words = (process.argv.slice(2).find((a) => !a.startsWith("--")) ?? process.env.IMAGE_BLOCKLIST ?? "").split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
const bad = (u?: string | null) => !!u && words.some((w) => u.toLowerCase().includes(w));

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI must be set");
  if (!words.length) throw new Error("Nothing to remove: set IMAGE_BLOCKLIST or pass words, e.g. npm run remove-images -- Screenshot_");
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB ?? "souq_uae_dev", autoIndex: false });
  const regex = new RegExp(words.map(escapeRe).join("|"), "i");
  const products = await Product.find({ $or: [{ "images.url": regex }, { "variants.image": regex }] }).lean();
  const backup: Record<string, { images: string[]; variants: Record<string, string> }> = {};
  let imgs = 0, vars = 0;
  for (const p of products) {
    const keep = (p.images ?? []).filter((i) => !bad(i.url));
    const removed = (p.images ?? []).filter((i) => bad(i.url)).map((i) => i.url ?? "");
    const variants = (p.variants ?? []).map((v) => (bad(v.image) ? { ...v, image: undefined } : v));
    const removedVars = Object.fromEntries((p.variants ?? []).filter((v) => bad(v.image)).map((v) => [v.sku, v.image!]));
    imgs += removed.length; vars += Object.keys(removedVars).length;
    backup[p.sku] = { images: removed, variants: removedVars };
    if (apply) await Product.updateOne({ _id: p._id }, { $set: { images: keep, variants } });
  }
  console.log(`${apply ? "REMOVED" : "DRY RUN — would remove"} ${imgs} gallery image(s) and ${vars} option picture(s) from ${products.length} product(s) (words: ${words.join(", ")}).`);
  if (apply && products.length) { await writeFile(path.join(process.cwd(), "scripts", "remove-images.backup.json"), JSON.stringify(backup, null, 2)); console.log("Backup: scripts/remove-images.backup.json"); }
  if (!apply) console.log("Run again with --apply to do it.");
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
