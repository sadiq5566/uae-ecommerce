import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, refreshStore } from "../../../../../lib/admin-api";
import { parseCsv } from "../../../../../lib/csv";
import { ProductModel } from "../../../../../lib/models/Product";
import { CollectionModel } from "../../../../../lib/models/Collection";
import { validateRecords } from "../../../../../lib/product-import";
import { groupRows, VARIANTS_FIELD } from "../../../../../lib/import-group";
import { cloudinaryConfigured, uploadRemote } from "../../../../../lib/cloudinary";
import { isDuplicateKey } from "../../../../../lib/utils";
import { categoryTitle } from "../../../../../lib/catalog-shared";

const MAX_ROWS = 5000;
const MAX_BATCH = 100;
const MAX_CELL = 6000;
const MAX_VARIANTS_CELL = 200_000; // a grouped product carries all its colour/size variants in one cell

const record = z.record(z.string(), z.string()).transform((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.slice(0, k === VARIANTS_FIELD ? MAX_VARIANTS_CELL : MAX_CELL)])));
const body = z.union([
  z.object({ csv: z.string().min(1) }),
  z.object({ records: z.array(z.object({ line: z.number().int(), record })).min(1).max(MAX_BATCH) }),
]);

/**
 * Two steps, same validator:
 *  - { csv }      -> preview: parse + validate, nothing is written. Returns row results and the valid records.
 *  - { records }  -> import one batch (<= 100 rows). The batch is validated again, the browser is never trusted.
 */
export async function POST(req: Request) {
  return adminRoute(req, async () => {
    const input = body.parse(await req.json());

    if ("csv" in input) {
      const parsed = parseCsv(input.csv);
      if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
      if (parsed.rows.length > MAX_ROWS) return NextResponse.json({ error: `Too many rows (${parsed.rows.length}). Maximum is ${MAX_ROWS} per file.` }, { status: 400 });
      const missing = ["sku"].filter((c) => !parsed.headers.includes(c));
      if (missing.length) return NextResponse.json({ error: `Missing required column: ${missing.join(", ")}. Found: ${parsed.headers.join(", ") || "none"}` }, { status: 400 });

      // One row per size/colour in the file becomes one product with variants.
      const rows = groupRows(parsed.rows);
      const results = await validateRecords(rows.map((r) => ({ line: r.line, record: r.data })));
      const lineToRecord = new Map(rows.map((r) => [r.line, r.data]));
      return NextResponse.json({
        total: results.length,
        fileRows: parsed.rows.length,
        create: results.filter((r) => r.action === "create").length,
        update: results.filter((r) => r.action === "update").length,
        invalid: results.filter((r) => r.action === "error").length,
        unknownColumns: parsed.unknown,
        rows: results.map((r) => ({ line: r.line, sku: r.sku, name: r.name, action: r.action, errors: r.errors })),
        records: results.filter((r) => r.action !== "error").map((r) => ({ line: r.line, record: lineToRecord.get(r.line)! })),
      });
    }

    const results = await validateRecords(input.records);
    const useCloud = cloudinaryConfigured();
    let created = 0;
    let updated = 0;
    let merged = 0;
    const failed: { line: number; sku: string; error: string }[] = [];

    for (const r of results) {
      if (r.action === "error" || !r.data) {
        failed.push({ line: r.line, sku: r.sku, error: r.errors.join("; ") });
        continue;
      }
      try {
        const data = r.data;
        if (useCloud) {
          data.images = await Promise.all(
            data.images.map(async (img) => (img.publicId || img.url.startsWith("https://res.cloudinary.com/") || img.url.startsWith("/") ? img : { ...img, ...(await uploadRemote(img.url)) })),
          );
        }
        const res = await ProductModel.updateOne({ sku: data.sku }, { $set: data, $unset: { mergedInto: "" } }, { upsert: true });
        if (res.upsertedCount) created++;
        else updated++;
        // Earlier imports made one product per size row. Archive those leftovers (kept, not deleted) now that they are variants.
        if (data.variants.length > 1) {
          const others = data.variants.map((v) => v.sku).filter((s) => s !== data.sku);
          const gone = await ProductModel.updateMany({ sku: { $in: others }, name: data.name, "variants.1": { $exists: false }, mergedInto: null }, { $set: { status: "archived", mergedInto: data.sku } });
          merged += gone.modifiedCount;
        }
      } catch (e) {
        failed.push({ line: r.line, sku: r.sku, error: isDuplicateKey(e) ? "SKU or slug already exists" : e instanceof Error ? e.message : "failed" });
      }
    }
    // A category seen for the first time gets its own "All <Category>" collection page.
    for (const cat of new Set(results.filter((r) => r.data).map((r) => r.data!.category))) {
      const name = categoryTitle(cat);
      await CollectionModel.updateOne(
        { slug: "all-" + cat },
        { $setOnInsert: { slug: "all-" + cat, name, description: "", image: "", type: "category", parent: cat, sortOrder: 50 } },
        { upsert: true },
      );
    }
    if (created || updated) refreshStore();
    return NextResponse.json({ created, updated, merged, failed, cloudinary: useCloud });
  });
}
