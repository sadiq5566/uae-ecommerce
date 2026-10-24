import "server-only";
import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { escapeRe } from "@/lib/admin/common";
import { Category } from "@/models/category";
import { InventoryMovement } from "@/models/inventory-movement";
import { Product } from "@/models/product";
import type { CategoryFormData } from "./category-form";
import type { CategoryOption, ProductFormData } from "./product-form";

type L = { en: string; ar: string };
const toLocalInput = (d?: Date | null) => (d ? new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 16) : ""); // Dubai wall time for <input type=datetime-local>

/** Category choices for the product form: every category slug in use plus the Collection documents of type "category". id is the slug products store. */
export async function categoryOptions(): Promise<CategoryOption[]> {
  await connectDb();
  const [used, cols] = await Promise.all([Product.distinct("category") as Promise<string[]>, Category.find({ type: "category" }).sort({ sortOrder: 1 }).lean()]);
  const names = new Map(cols.map((c) => [c.parent as string, String(c.name).replace(/^All /, "")]));
  const slugs = [...new Set([...cols.map((c) => c.parent as string).filter(Boolean), ...used.filter(Boolean)])];
  return slugs.map((slug) => ({ id: slug, name: names.get(slug) ?? slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " "), parent: null }));
}

/** Everything the product list can be filtered/sorted by. Parsed from the URL so the bulk actions can rebuild the exact same filter on the server. */
export const PRODUCT_SORTS = {
  updated: { label: "Recently updated", sort: { updatedAt: -1 } },
  newest: { label: "Newest first", sort: { createdAt: -1 } },
  oldest: { label: "Oldest first", sort: { createdAt: 1 } },
  name_asc: { label: "Name A–Z", sort: { name: 1 } },
  name_desc: { label: "Name Z–A", sort: { name: -1 } },
  price_asc: { label: "Price: low → high", sort: { priceTo: 1 } },
  price_desc: { label: "Price: high → low", sort: { priceTo: -1 } },
  stock_asc: { label: "Stock: low → high", sort: { stock: 1 } },
  stock_desc: { label: "Stock: high → low", sort: { stock: -1 } },
  status_asc: { label: "Status A–Z", sort: { status: 1 } },
  status_desc: { label: "Status Z–A", sort: { status: -1 } },
  sku: { label: "SKU", sort: { sku: 1 } },
} as const;
export const PAGE_SIZES = [12, 20, 50, 100] as const;
export const FILTER_KEYS = ["q", "status", "category", "brand", "tag", "stock", "featured", "sale", "image", "variants", "min", "max", "from", "to", "sort", "per"] as const;
export type ProductFilters = { q: string; status: string; category: string; brand: string; tag: string; stock: string; featured: string; sale: string; image: string; variants: string; min: string; max: string; from: string; to: string; sort: keyof typeof PRODUCT_SORTS; per: number };

export function parseProductFilters(sp: Record<string, string | string[] | undefined>): ProductFilters {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const one = (k: string, ok: string[]) => (ok.includes(s(k)) ? s(k) : "");
  const per = Number(s("per"));
  return {
    q: s("q").slice(0, 80), status: one("status", ["draft", "active", "archived"]), category: /^[a-z0-9][a-z0-9-]{0,39}$/.test(s("category")) ? s("category") : "",
    brand: s("brand").slice(0, 60), tag: s("tag").toLowerCase().slice(0, 40),
    stock: one("stock", ["in", "out", "low"]) || (s("low") === "1" ? "low" : ""), // `low=1` = old URLs
    featured: one("featured", ["1", "0"]), sale: one("sale", ["1"]), image: one("image", ["with", "without"]), variants: one("variants", ["with", "without"]),
    min: /^\d+(\.\d+)?$/.test(s("min")) ? s("min") : "", max: /^\d+(\.\d+)?$/.test(s("max")) ? s("max") : "",
    from: /^\d{4}-\d{2}-\d{2}$/.test(s("from")) ? s("from") : "", to: /^\d{4}-\d{2}-\d{2}$/.test(s("to")) ? s("to") : "",
    sort: (s("sort") in PRODUCT_SORTS ? s("sort") : "updated") as ProductFilters["sort"], per: (PAGE_SIZES as readonly number[]).includes(per) ? per : 20,
  };
}

/** Mongo filter for the product list. A chosen category also matches its sub-categories. */
// Products merged into another product (see Product.mergedInto) are internal leftovers: never listed, never part of "select all".
export async function productFilterQuery(f: ProductFilters): Promise<Record<string, unknown>> {
  const and: Record<string, unknown>[] = [{ mergedInto: null }];
  if (f.q) { const re = new RegExp(escapeRe(f.q), "i"); and.push({ $or: [{ name: re }, { model: re }, { sku: re }, { slug: re }, { brand: re }, { "variants.sku": re }, { tags: re }] }); }
  if (f.status) and.push({ status: f.status });
  if (f.category) and.push({ category: f.category });
  if (f.brand) and.push({ brand: new RegExp(`^${escapeRe(f.brand)}$`, "i") });
  if (f.tag) and.push({ tags: f.tag });
  if (f.stock === "out") and.push({ stock: 0 });
  if (f.stock === "in") and.push({ stock: { $gt: 0 } });
  if (f.stock === "low") and.push({ $expr: { $lte: ["$stock", "$lowStockThreshold"] } });
  if (f.featured) and.push({ isFeatured: f.featured === "1" });
  if (f.sale) and.push({ $expr: { $lt: ["$priceTo", "$priceFrom"] } });
  if (f.image) and.push({ "images.0": { $exists: f.image === "with" } });
  if (f.variants) and.push({ "variants.0": { $exists: f.variants === "with" } });
  if (f.min || f.max) and.push({ priceTo: { ...(f.min ? { $gte: Number(f.min) } : {}), ...(f.max ? { $lte: Number(f.max) } : {}) } });
  if (f.from || f.to) and.push({ createdAt: { ...(f.from ? { $gte: new Date(`${f.from}T00:00:00+04:00`) } : {}), ...(f.to ? { $lte: new Date(`${f.to}T23:59:59.999+04:00`) } : {}) } });
  return and.length ? { $and: and } : {};
}

export async function brandOptions(): Promise<string[]> {
  await connectDb();
  return ((await Product.distinct("brand")) as string[]).filter(Boolean).sort((a, b) => a.localeCompare(b)).slice(0, 300);
}

export async function listProductsAdmin(f: ProductFilters, page: number) {
  await connectDb();
  const filter = await productFilterQuery(f);
  const size = f.per;
  const [rows, total] = await Promise.all([
    Product.find(filter).sort({ ...PRODUCT_SORTS[f.sort].sort, _id: 1 } as Record<string, 1 | -1>).skip((page - 1) * size).limit(size).select("slug sku name priceFrom priceTo stock lowStockThreshold status isFeatured category images variants").lean(),
    Product.countDocuments(filter),
  ]);
  return { rows: rows.map((p) => ({ id: String(p._id), slug: p.slug, sku: p.sku, name: p.name ?? "", price: Math.max(p.priceFrom ?? 0, p.priceTo ?? 0), finalPrice: p.priceTo ?? 0, stock: p.stock, low: p.lowStockThreshold, status: p.status, featured: !!p.isFeatured, category: p.category, brand: p.brand ?? "", icon: "📦", image: p.images?.[0]?.url, variantCount: p.variants?.length ?? 0 })), total, pages: Math.max(1, Math.ceil(total / size)) };
}

export async function getProductForm(id: string): Promise<ProductFormData | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  await connectDb();
  const p = await Product.findById(id).lean();
  if (!p) return null;
  return {
    id: String(p._id), slug: p.slug, sku: p.sku, name: p.name, shortDescription: p.shortDescription ?? "", longDescription: p.longDescription ?? "", category: p.category, subcategory: p.subcategory ?? "general",
    brand: p.brand ?? undefined, model: p.model ?? undefined, finish: p.finish ?? undefined, priceFrom: p.priceFrom ?? 0, priceTo: p.priceTo ?? 0, stock: p.stock, lowStockThreshold: p.lowStockThreshold,
    status: p.status, isFeatured: !!p.isFeatured, isNewArrival: !!p.isNewArrival, isMostWanted: !!p.isMostWanted, tags: p.tags ?? [], highlights: p.highlights ?? [], includedItems: p.includedItems ?? [],
    images: (p.images ?? []).map((i) => ({ url: i.url ?? "", alt: { en: i.alt ?? "", ar: "" } })),
    variants: (p.variants ?? []).map((v) => ({ sku: v.sku, color: v.color ?? "", size: v.size ?? "", stock: v.stock, price: v.price ?? "", image: v.image ?? "" })),
    seo: { title: p.seo?.title ?? "", description: p.seo?.description ?? "" },
  };
}

export async function getCategoryForm(id: string): Promise<CategoryFormData | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  await connectDb();
  const c = await Category.findById(id).lean();
  if (!c) return null;
  return { id: String(c._id), slug: c.slug, name: c.name, description: c.description ?? "", image: c.image || undefined, type: c.type, parent: c.parent ?? undefined, sortOrder: c.sortOrder ?? 0 };
}

export async function listCategoriesAdmin() {
  await connectDb();
  const [rows, counts] = await Promise.all([Category.find().sort({ sortOrder: 1, name: 1 }).lean(), Product.aggregate([{ $group: { _id: "$category", n: { $sum: 1 } } }])]);
  const cnt = new Map<string, number>(counts.map((c) => [String(c._id), c.n as number]));
  return rows.map((c) => ({ id: String(c._id), slug: c.slug, name: c.name, nameAr: "", depth: 0, active: true, order: c.sortOrder ?? 0, icon: "📦", type: c.type, products: c.parent ? cnt.get(c.parent) ?? 0 : 0 }));
}

export const INVENTORY_SORTS = { stock: "stock", name: "name", sku: "sku", updated: "updatedAt", threshold: "lowStockThreshold", status: "status" } as const;
export type InventoryFilters = { q: string; level: string; status: string; category: string; variants: string; from: string; to: string };

export async function listInventory(f: InventoryFilters, sort: keyof typeof INVENTORY_SORTS, dir: 1 | -1, page: number, size = 25) {
  await connectDb();
  const and: Record<string, unknown>[] = [{ status: f.status ? f.status : { $ne: "archived" } }, { mergedInto: null }];
  if (f.q) { const re = new RegExp(escapeRe(f.q.slice(0, 80)), "i"); and.push({ $or: [{ name: re }, { sku: re }, { "variants.sku": re }, { brand: re }] }); }
  if (f.level === "out") and.push({ stock: 0 });
  if (f.level === "low") and.push({ stock: { $gt: 0 }, $expr: { $lte: ["$stock", "$lowStockThreshold"] } });
  if (f.level === "lowout") and.push({ $expr: { $lte: ["$stock", "$lowStockThreshold"] } });
  if (f.level === "ok") and.push({ $expr: { $gt: ["$stock", "$lowStockThreshold"] } });
  if (f.category) and.push({ category: f.category });
  if (f.variants) and.push({ "variants.0": { $exists: f.variants === "with" } });
  if (f.from || f.to) and.push({ updatedAt: { ...(f.from ? { $gte: new Date(`${f.from}T00:00:00+04:00`) } : {}), ...(f.to ? { $lte: new Date(`${f.to}T23:59:59.999+04:00`) } : {}) } });
  const m = { $and: and };
  const [rows, total] = await Promise.all([Product.find(m).sort({ [INVENTORY_SORTS[sort]]: dir, name: 1 }).skip((page - 1) * size).limit(size).select("sku name stock lowStockThreshold variants status images").lean(), Product.countDocuments(m)]);
  return { rows: rows.map((p) => ({ id: String(p._id), sku: p.sku, name: p.name ?? "", image: p.images?.[0]?.url as string | undefined, stock: p.stock, low: p.lowStockThreshold, status: p.status, variants: (p.variants ?? []).map((v) => ({ sku: v.sku, label: [v.color, v.size].filter(Boolean).join(" / ") || v.sku, stock: v.stock })) })), total, pages: Math.max(1, Math.ceil(total / size)) };
}

export async function recentMovements(limit = 15) {
  await connectDb();
  const rows = await InventoryMovement.find().sort({ createdAt: -1 }).limit(limit).lean();
  return rows.map((m) => ({ id: String(m._id), sku: m.sku, delta: m.delta, reason: m.reason, note: m.note ?? "", at: (m as unknown as { createdAt: Date }).createdAt, order: m.order ? String(m.order) : "" }));
}
