"use server";
import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { actor } from "@/lib/admin/guard";
import { audit } from "@/lib/admin/audit";
import { MAX_CSV_BYTES, MAX_CSV_ROWS, mapColumns, parseCsv, rowObject } from "@/lib/csv";
import { Category } from "@/models/category";
import { InventoryMovement } from "@/models/inventory-movement";
import { Product } from "@/models/product";
import { CATEGORY_COLUMNS, validateCategoryRows } from "./categories";
import { PRODUCT_COLUMNS, validateProductRows, type ExistingProduct, type ProductCtx, type RowIssue } from "./products";

export type Kind = "products" | "categories";
export type IssueLite = { line: number; sku: string; action: RowIssue["action"]; errors: string[] };
export type PreviewState = { ok: false; error: string } | { ok: true; kind: Kind; unknown: string[]; present: string[]; rows: { line: number; data: Record<string, string> }[]; issues: IssueLite[] } | null;
export type BatchResult = { line: number; sku: string; status: "created" | "updated" | "failed"; errors: string[] };

const COLS = { products: PRODUCT_COLUMNS, categories: CATEGORY_COLUMNS } as const;
const perm = (k: Kind) => (k === "products" ? "products:write" : "categories:write") as "products:write" | "categories:write";
const lite = (i: RowIssue): IssueLite => ({ line: i.line, sku: i.sku, action: i.action, errors: i.errors });

async function productCtx(rows: Record<string, string>[], present: Set<string>): Promise<ProductCtx> {
  await connectDb();
  const skus = rows.map((r) => (r.sku ?? "").toUpperCase()).filter(Boolean);
  const slugs = rows.map((r) => (r.slug ?? "").toLowerCase()).filter(Boolean);
  const [cats, existing, slugClash] = await Promise.all([
    Category.find({}, { slug: 1, attributes: 1 }).lean(),
    Product.find({ sku: { $in: skus } }).select("sku slug price salePrice saleStartsAt saleEndsAt stock variants category").lean(),
    slugs.length ? Product.find({ slug: { $in: slugs } }).select("sku slug").lean() : [],
  ]);
  const bySku = new Map<string, ExistingProduct>(existing.map((p) => [p.sku, { id: String(p._id), sku: p.sku, slug: p.slug, price: p.price, salePrice: p.salePrice, saleStartsAt: p.saleStartsAt, saleEndsAt: p.saleEndsAt, stock: p.stock, hasVariants: (p.variants?.length ?? 0) > 0, categoryId: String(p.category) }]));
  return {
    categories: new Map(cats.map((c) => [c.slug, { id: String(c._id), attrKeys: (c.attributes ?? []).map((a) => a.key) }])),
    bySku, slugOwner: new Map(slugClash.map((p) => [p.slug, p.sku])), present,
  };
}

async function categoryCtx(present: Set<string>) {
  await connectDb();
  const cats = await Category.find({}, { slug: 1, parent: 1 }).lean();
  return { bySlug: new Map(cats.map((c) => [c.slug, { id: String(c._id), parent: c.parent ? String(c.parent) : null }])), present };
}

/** Step 1: parse + validate the whole file and return a preview. Nothing is written. */
export async function previewImportAction(_: PreviewState, fd: FormData): Promise<PreviewState> {
  const kind = String(fd.get("kind")) === "categories" ? "categories" : "products";
  if (!(await actor(perm(kind)))) return { ok: false, error: "You don't have permission to import." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a CSV file." };
  if (file.size > MAX_CSV_BYTES) return { ok: false, error: `File is too large (max ${MAX_CSV_BYTES / 1024 / 1024} MB).` };
  if (!/\.csv$/i.test(file.name) && !/csv|text\/plain|excel/.test(file.type)) return { ok: false, error: "Please upload a .csv file." };
  const parsed = parseCsv(await file.text(), { maxRows: MAX_CSV_ROWS });
  if (parsed.error) return { ok: false, error: parsed.error };
  const { index, unknown, dupes, present } = mapColumns(parsed.headers, COLS[kind]);
  if (dupes.length) return { ok: false, error: `Duplicate column(s): ${dupes.join(", ")}` };
  const key = kind === "products" ? "sku" : "slug";
  if (!present.has(key)) return { ok: false, error: `The file needs a "${key}" column (it identifies each row).` };
  const rows = parsed.rows.map((r, i) => ({ line: i + 2, data: rowObject(r, index) }));
  const objs = rows.map((r) => r.data);
  const issues = kind === "products" ? validateProductRows(objs, await productCtx(objs, present)) : validateCategoryRows(objs, await categoryCtx(present));
  return { ok: true, kind, unknown, present: [...present], rows, issues: issues.map(lite) };
}

/** Step 2 (called in batches of ≤100 by the browser for progress): re-validates and applies the rows. Invalid rows are reported, never skipped silently. */
export async function importBatchAction(kind: Kind, present: string[], batch: { line: number; data: Record<string, string> }[]): Promise<{ ok: boolean; error?: string; results: BatchResult[] }> {
  const user = await actor(perm(kind));
  if (!user) return { ok: false, error: "Forbidden", results: [] };
  if (!Array.isArray(batch) || batch.length > 100) return { ok: false, error: "Batch too large", results: [] };
  const known = new Set(Object.keys(COLS[kind]));
  const presentSet = new Set(present.filter((c) => known.has(c)));
  const rows = batch.map((b) => Object.fromEntries(Object.entries(b.data ?? {}).filter(([k, v]) => known.has(k) && typeof v === "string").map(([k, v]) => [k, v.slice(0, 6000)])));
  await connectDb();
  const results: BatchResult[] = [];
  const issues = kind === "products" ? validateProductRows(rows, await productCtx(rows, presentSet)) : validateCategoryRows(rows, await categoryCtx(presentSet));

  for (let i = 0; i < issues.length; i++) {
    const iss = issues[i]; const line = batch[i].line;
    if (iss.action === "error") { results.push({ line, sku: iss.sku, status: "failed", errors: iss.errors }); continue; }
    try {
      if (kind === "products") {
        const doc = iss.action === "update" ? await Product.findOne({ sku: iss.sku }) : new Product({ sku: iss.sku });
        if (!doc) { results.push({ line, sku: iss.sku, status: "failed", errors: ["product disappeared during import"] }); continue; }
        const oldSlug = doc.slug;
        for (const [k, v] of Object.entries(iss.doc ?? {})) if (k !== "finalPrice") doc.set(k, v);
        if (iss.action === "update" && iss.doc?.slug && oldSlug && oldSlug !== iss.doc.slug) doc.slugHistory = [...new Set([...(doc.slugHistory ?? []), oldSlug])];
        if (iss.action === "create" && !doc.lowStockThreshold) doc.lowStockThreshold = 5;
        await doc.save();
        if (iss.stockDelta) await InventoryMovement.create({ product: doc._id, sku: iss.sku, delta: iss.stockDelta, reason: iss.action === "create" ? "restock" : "correction", actor: user.id, note: "CSV import" });
      } else {
        const d = { ...(iss.doc ?? {}) } as Record<string, unknown>;
        const parentSlug = d.parentSlug as string | undefined; delete d.parentSlug;
        const doc = iss.action === "update" ? await Category.findOne({ slug: iss.sku }) : new Category({ slug: iss.sku });
        if (!doc) { results.push({ line, sku: iss.sku, status: "failed", errors: ["category disappeared during import"] }); continue; }
        if (parentSlug) { const parent = await Category.findOne({ slug: parentSlug }); if (!parent || parent.parent) { results.push({ line, sku: iss.sku, status: "failed", errors: [`parent "${parentSlug}" not found yet (put parents before children)`] }); continue; } doc.parent = parent._id; }
        for (const [k, v] of Object.entries(d)) doc.set(k, v);
        await doc.save();
      }
      results.push({ line, sku: iss.sku, status: iss.action === "update" ? "updated" : "created", errors: [] });
    } catch (e) {
      const msg = (e as { code?: number }).code === 11000 ? "duplicate sku/slug" : (e as Error).message.slice(0, 200);
      results.push({ line, sku: iss.sku, status: "failed", errors: [msg] });
    }
  }
  const n = (s: BatchResult["status"]) => results.filter((r) => r.status === s).length;
  await audit(user, `${kind === "products" ? "product" : "category"}.csv_import`, kind, undefined, `CSV import (${kind}): ${n("created")} created, ${n("updated")} updated, ${n("failed")} failed`, { lines: [batch[0]?.line, batch.at(-1)?.line] });
  revalidatePath("/[lang]", "layout"); revalidatePath(`/admin/${kind === "products" ? "products" : "categories"}`);
  return { ok: true, results };
}
