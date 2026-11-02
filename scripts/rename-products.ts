// One-off: gives the products whose title was only the brand name ("Messika", "Louis Vuitton") a proper name, from what their photos show.
//   node scripts/with-env.cjs scripts/rename-products.ts            dry run
//   node scripts/with-env.cjs scripts/rename-products.ts --apply    writes (a backup goes to scripts/rename-products.backup.json)
// Only products still named like their brand are touched, so running it twice changes nothing. The old link keeps working (slugHistory).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { ProductModel } from "../lib/models/Product";

const apply = process.argv.includes("--apply");
const names: Record<string, [string, string]> = JSON.parse(readFileSync(path.join(__dirname, "product-names.json"), "utf8"));
const P = ProductModel as unknown as mongoose.Model<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const norm = (s: string) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB || undefined });
  const docs: any[] = await P.find({ sku: { $in: Object.keys(names) } }).lean(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const backup: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  let changed = 0, skipped = 0;
  for (const d of docs) {
    if (norm(d.name) !== norm(d.brand)) { skipped++; continue; } // already has a real name
    const [en, ar] = names[d.sku];
    let slug = slugify(en);
    if (await P.exists({ slug, _id: { $ne: d._id } })) slug = `${slug}-${d.sku.slice(-4).toLowerCase()}`;
    const short = `The ${en} is selected for a refined everyday look, with a polished finish and sparkling detail that is easy to style.`;
    const set: Record<string, unknown> = {
      name: en, nameAr: ar, model: en, slug,
      shortDescription: short, longDescription: `${short}\r\n\r\nPolished finish with sparkling detail\r\nBeautifully presented and ready to gift`,
      "seo.title": `${en} | Buy Online in UAE`.slice(0, 70),
      "seo.description": `Buy the ${en} online in the UAE. Fast delivery in Dubai, Abu Dhabi and Sharjah, cash on delivery and easy returns.`.slice(0, 160),
      images: (d.images ?? []).map((i: { url: string; alt?: string }) => ({ ...i, alt: en })),
    };
    if (d.category === "general") {
      set.category = "jewelry";
      set.tags = [d.brand.toLowerCase(), `${d.brand.toLowerCase()} jewelry uae`, `${d.brand.toLowerCase()} jewelry dubai`, "buy luxury jewelry dubai", "luxury jewelry uae", "cash on delivery uae"];
    }
    console.log(`${d.sku}: "${d.name}" -> "${en}"  /${d.slug} -> /${slug}${set.category ? "  [category general -> jewelry]" : ""}`);
    changed++;
    if (!apply) continue;
    backup.push(d);
    await P.updateOne({ _id: d._id }, { $set: set, $addToSet: { slugHistory: d.slug } });
  }
  console.log(`\n${apply ? "renamed" : "would rename"} ${changed} product(s); ${skipped} already had a real name; ${Object.keys(names).length - docs.length} sku(s) not found.`);
  if (apply && backup.length) writeFileSync(path.join(__dirname, "rename-products.backup.json"), JSON.stringify(backup, null, 1));
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
