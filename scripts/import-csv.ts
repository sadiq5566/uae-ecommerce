/* eslint-disable @typescript-eslint/no-explicit-any */
// Imports product CSV files from the command line, with no row limit (the admin upload stops at 5,000 rows).
// All files are read first and their rows grouped together, so one product's colour / size rows become ONE product with variants
// even when the rows sit in different files. Rows are matched by SKU (existing SKU = update, new = create).
//
//   npm run import-csv -- <file.csv | folder> [more files...]            dry run: validates everything, writes nothing
//   npm run import-csv -- <file.csv | folder> ... --apply                saves; one-row-per-size products from older imports are archived (kept, not deleted)
//   --batch=100                                                         rows validated and saved per round trip
//   --clean-map=<file.json>                                             original -> cleaned image map written by `npm run clean-images` (default scripts/clean-images.map.json).
//                                                                       Any CSV image URL found in it is replaced by its cleaned copy, so importing never brings a removed watermark back.
//
// A missing / 0 stock becomes IMPORT_DEFAULT_STOCK (default 20) per variant; an existing product keeps the stock it has.
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { parseCsv, type CsvRow } from "../lib/csv";
import { groupRows } from "../lib/import-group";
import { persistBatch, validateRecords } from "../lib/product-import";
import { CollectionModel } from "../lib/models/Collection";
import { categoryTitle } from "../lib/catalog-shared";

const args = process.argv.slice(2);
// `npm run x --apply` (without the extra "--") reaches the script as an npm env var, not an argument: accept both.
const apply = args.includes("--apply") || process.env.npm_config_apply === "true";
const batchSize = Number(args.find((a) => a.startsWith("--batch="))?.split("=")[1]) || 100;
const inputs = args.filter((a) => !a.startsWith("--"));
const mapPath = args.find((a) => a.startsWith("--clean-map="))?.split("=")[1] ?? path.join(process.cwd(), "scripts", "clean-images.map.json");

async function expand(p: string): Promise<string[]> {
  const s = await stat(p);
  if (!s.isDirectory()) return [p];
  return (await readdir(p)).filter((f) => f.toLowerCase().endsWith(".csv")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((f) => path.join(p, f));
}

/** The database can be slow or drop a connection mid-run: retry a few times before giving up on a batch. */
async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= tries) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

async function main() {
  if (!inputs.length) throw new Error("Usage: npm run import-csv -- <file.csv | folder> [more...] [--apply]");
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI must be set (.env.local)");
  const files = (await Promise.all(inputs.map(expand))).flat();

  const rows: CsvRow[] = [];
  const where = new Map<number, string>(); // global row id -> "file:line" for error messages
  for (const f of files) {
    const parsed = parseCsv(await readFile(f, "utf8"));
    if (parsed.error) throw new Error(`${path.basename(f)}: ${parsed.error}`);
    if (!parsed.headers.includes("sku")) throw new Error(`${path.basename(f)}: no "sku" column. Found: ${parsed.headers.join(", ")}`);
    if (parsed.unknown.length) console.log(`  ${path.basename(f)}: ignoring unknown columns: ${parsed.unknown.join(", ")}`);
    for (const r of parsed.rows) {
      const id = rows.length + 1;
      where.set(id, `${path.basename(f)}:${r.line}`);
      rows.push({ line: id, data: r.data });
    }
    console.log(`  read ${path.basename(f)}: ${parsed.rows.length} rows (columns: ${parsed.headers.join(", ")})`);
  }
  const cleaned: Record<string, string> = await readFile(mapPath, "utf8").then((t) => JSON.parse(t), () => ({}));
  console.log(`  image clean map: ${Object.keys(cleaned).length} cleaned image(s) known (${path.basename(mapPath)})`);
  const grouped = groupRows(rows);
  console.log(`\n${rows.length} rows from ${files.length} file(s) -> ${grouped.length} products after grouping colour/size rows${apply ? "  [APPLY]" : "  [DRY RUN]"}\n`);

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || undefined });
  const tally = { create: 0, update: 0, error: 0, variants: 0, multi: 0, archived: 0, writeErrors: 0 };
  const errors: string[] = [];
  const categories = new Set<string>();
  let swapped = 0;
  const failedBatches: string[] = [];
  for (let i = 0; i < grouped.length; i += batchSize) {
    const slice = grouped.slice(i, i + batchSize);
    let results: Awaited<ReturnType<typeof validateRecords>>;
    try {
      results = await withRetry(() => validateRecords(slice.map((r) => ({ line: r.line, record: r.data }))));
    } catch (e) {
      failedBatches.push(`${i + 1}-${i + slice.length}`);
      errors.push(`batch ${i + 1}-${i + slice.length}: ${(e as Error).message.slice(0, 120)}`);
      continue;
    }
    for (const r of results) {
      const d = r.data;
      if (!d) continue;
      for (const img of d.images) if (cleaned[img.url]) { img.url = cleaned[img.url]; swapped++; }
      for (const v of d.variants) if (v.image && cleaned[v.image]) { v.image = cleaned[v.image]; swapped++; }
    }
    for (const r of results) {
      if (r.action === "error") {
        tally.error++;
        if (errors.length < 40) errors.push(`${where.get(r.line)}  ${r.sku}: ${r.errors.join("; ")}`);
      } else {
        tally[r.action]++;
        tally.variants += r.data!.variants.length;
        if (r.data!.variants.length > 1) tally.multi++;
        categories.add(r.data!.category);
      }
    }
    if (apply) {
      try {
        const w = await withRetry(() => persistBatch(results));
        tally.archived += w.archived;
        tally.writeErrors += w.errors.length;
        for (const e of w.errors) if (errors.length < 40) errors.push(`save: ${e}`);
      } catch (e) {
        failedBatches.push(`${i + 1}-${i + slice.length}`);
        errors.push(`save batch ${i + 1}-${i + slice.length}: ${(e as Error).message.slice(0, 120)}`);
      }
    }
    process.stdout.write(`\r  ${Math.min(i + batchSize, grouped.length)}/${grouped.length}`);
  }

  if (apply) {
    // A category seen for the first time gets its own "All <Category>" page, like the admin importer does.
    for (const cat of categories) {
      await CollectionModel.updateOne({ slug: "all-" + cat }, { $setOnInsert: { slug: "all-" + cat, name: categoryTitle(cat), description: "", image: "", type: "category", parent: cat, sortOrder: 50 } }, { upsert: true });
    }
  }
  console.log(`\n\n${apply ? "SAVED" : "WOULD SAVE"}: ${tally.create} new + ${tally.update} updated products (${tally.multi} with several colour/size variants, ${tally.variants} variants in total), ${swapped} image URLs swapped for their cleaned copy, ${tally.error} rows rejected${apply ? `, ${tally.archived} old one-row products archived, ${tally.writeErrors} save errors` : ""}.`);
  if (errors.length) console.log("\nFirst problems:\n  " + errors.join("\n  "));
  if (failedBatches.length) console.log(`\nINCOMPLETE: ${failedBatches.length} batch(es) failed after retries (${failedBatches.slice(0, 8).join(", ")}). Run the same command again: it is safe to repeat and only redoes what is missing.`);
  if (!apply) console.log("\nNothing was written. Add --apply to save.");
  else console.log("\nRestart the site (or wait ~5 minutes) to see the change: product pages are cached.");
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
