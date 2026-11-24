/* eslint-disable @typescript-eslint/no-explicit-any */
// Product FAQs for search engines and AI answer engines (Google, ChatGPT, Gemini, Perplexity): "What is X?", "Which colours / sizes?", "What is included?",
// "Is X a good gift?", English + Arabic, written into each product's `faqs` field. The catalogue is SHARED by every storefront, so only questions about the
// PRODUCT are stored here; price, delivery to Dubai / Abu Dhabi / Sharjah, cash on delivery and returns are built live per store at render time (lib/faq.ts).
//
//   npm run db:seo-faq                dry run: shows counts and a few samples, writes nothing
//   npm run db:seo-faq -- --apply     writes (a backup of every touched product's old `faqs` goes to ./backups first)
//   --limit=50  --match=Rolex  --samples=5    try it on a few products first
//
// Safe to run again: rows written by this script carry `auto: true` and are regenerated from the product's current data (new colours, sizes...);
// rows an admin wrote by hand have no `auto` flag and are never touched. A product whose generated rows did not change is not written.
// It only states facts the data holds. It never invents materials, authenticity, warranty or discounts.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { ProductModel } from "../lib/models/Product";
import { buildProductFaqs, type FaqItem } from "../lib/faq";

const REGISTERED = ProductModel.modelName; // referenced so the model registers its schema and the import is kept
const args = process.argv.slice(2);
const apply = args.includes("--apply") || process.env.npm_config_apply === "true";
const limit = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1]) || 0;
const match = args.find((a) => a.startsWith("--match="))?.split("=").slice(1).join("=");
const nSamples = Number(args.find((a) => a.startsWith("--samples="))?.split("=")[1]) || 2;

const pick = (f: FaqItem) => ({ q: f.q, a: f.a, qAr: f.qAr ?? "", aAr: f.aAr ?? "" });
const sameAuto = (a: FaqItem[], b: FaqItem[]) => JSON.stringify(a.filter((f) => f.auto).map(pick)) === JSON.stringify(b.filter((f) => f.auto).map(pick));

async function main() {
  // Same rule as src/lib/store-config.ts dbTarget(): the shared database when USE_SHARED_DB is on, otherwise this store's own old database.
  const shared = /^(1|true|yes|on)$/i.test(process.env.USE_SHARED_DB ?? "");
  const uri = (!shared && process.env.OLD_MONGODB_URI) || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI must be set");
  await mongoose.connect(uri, { dbName: (!shared && process.env.OLD_MONGODB_DB) || process.env.MONGODB_DB || undefined });
  const col = mongoose.connection.db!.collection("products");
  console.log(`${apply ? "APPLY" : "DRY RUN"} on database "${mongoose.connection.db!.databaseName}" (model ${REGISTERED})`);

  const filter: any = { status: { $ne: "archived" } };
  if (match) filter.name = new RegExp(match, "i");
  const docs = await col.find(filter, { projection: { name: 1, nameAr: 1, brand: 1, category: 1, subcategory: 1, model: 1, finish: 1, highlights: 1, includedItems: 1, variants: 1, faqs: 1 } }).limit(limit || 0).toArray();

  const ops: any[] = [], samples: any[] = [];
  let kept = 0;
  for (const d of docs) {
    const existing: FaqItem[] = d.faqs ?? [];
    const manual = existing.filter((f) => !f.auto);
    const auto = buildProductFaqs({ name: d.name, nameAr: d.nameAr, brand: d.brand, category: d.category, subcategory: d.subcategory, model: d.model, finish: d.finish, highlights: d.highlights, includedItems: d.includedItems, variants: d.variants });
    kept += manual.length;
    if (sameAuto(existing, auto)) continue;
    const faqs = [...manual, ...auto];
    ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: { faqs } } } });
    if (samples.length < nSamples) samples.push({ name: d.name, faqs: faqs.map((f) => ({ q: f.q, a: f.a, qAr: f.qAr })) });
  }
  console.table([{ checked: docs.length, "will update": ops.length, "hand-written rows kept": kept }]);
  console.log("samples:\n" + JSON.stringify(samples, null, 1));
  if (!apply) { console.log("\nDry run: nothing written. Re-run with --apply."); return; }
  if (!ops.length) { console.log("\nNothing to change."); return; }

  const dir = path.join(process.cwd(), "backups");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ids = ops.map((o) => o.updateOne.filter._id);
  await writeFile(path.join(dir, `seo-faq-products-${stamp}.json`), JSON.stringify(await col.find({ _id: { $in: ids } }, { projection: { faqs: 1 } }).toArray()));
  for (let i = 0; i < ops.length; i += 500) await col.bulkWrite(ops.slice(i, i + 500), { ordered: false });
  console.log(`\nDone: ${ops.length} product(s) updated. Backup of the previous faqs: ${dir}${path.sep}seo-faq-products-${stamp}.json. Pages refresh within ~5 minutes (or restart the site).`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => mongoose.disconnect());
