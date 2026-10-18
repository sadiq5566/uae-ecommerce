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

export async function categoryOptions(): Promise<CategoryOption[]> {
  await connectDb();
  const rows = await Category.find().sort({ order: 1, "name.en": 1 }).lean();
  const parents = rows.filter((c) => !c.parent);
  const ordered = parents.flatMap((p) => [p, ...rows.filter((c) => String(c.parent) === String(p._id))]);
  return ordered.map((c) => ({ id: String(c._id), name: c.name?.en ?? "", parent: c.parent ? String(c.parent) : null, attributes: (c.attributes ?? []).map((a) => ({ key: a.key, label: a.label?.en ?? "" })) }));
}

/** Everything the product list can be filtered/sorted by. Parsed from the URL so the bulk actions can rebuild the exact same filter on the server. */
export const PRODUCT_SORTS = {
  updated: { label: "Recently updated", sort: { updatedAt: -1 } },
  newest: { label: "Newest first", sort: { createdAt: -1 } },
  oldest: { label: "Oldest first", sort: { createdAt: 1 } },
  name_asc: { label: "Name A–Z", sort: { "name.en": 1 } },
  name_desc: { label: "Name Z–A", sort: { "name.en": -1 } },
  price_asc: { label: "Price: low → high", sort: { finalPrice: 1 } },
  price_desc: { label: "Price: high → low", sort: { finalPrice: -1 } },
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
    q: s("q").slice(0, 80), status: one("status", ["draft", "published", "archived"]), category: Types.ObjectId.isValid(s("category")) ? s("category") : "",
    brand: s("brand").slice(0, 60), tag: s("tag").toLowerCase().slice(0, 40),
    stock: one("stock", ["in", "out", "low"]) || (s("low") === "1" ? "low" : ""), // `low=1` = old URLs
    featured: one("featured", ["1", "0"]), sale: one("sale", ["1"]), image: one("image", ["with", "without"]), variants: one("variants", ["with", "without"]),
    min: /^\d+(\.\d+)?$/.test(s("min")) ? s("min") : "", max: /^\d+(\.\d+)?$/.test(s("max")) ? s("max") : "",
    from: /^\d{4}-\d{2}-\d{2}$/.test(s("from")) ? s("from") : "", to: /^\d{4}-\d{2}-\d{2}$/.test(s("to")) ? s("to") : "",
    sort: (s("sort") in PRODUCT_SORTS ? s("sort") : "updated") as ProductFilters["sort"], per: (PAGE_SIZES as readonly number[]).includes(per) ? per : 20,
  };
}

/** Mongo filter for the product list. A chosen category also matches its sub-categories. */
export async function productFilterQuery(f: ProductFilters): Promise<Record<string, unknown>> {
  const and: Record<string, unknown>[] = [];
  if (f.q) { const re = new RegExp(escapeRe(f.q), "i"); and.push({ $or: [{ "name.en": re }, { "name.ar": re }, { sku: re }, { slug: re }, { brand: re }, { "variants.sku": re }, { tags: re }] }); }
  if (f.status) and.push({ status: f.status });
  if (f.category) {
    const kids = await Category.find({ parent: f.category }, { _id: 1 }).lean();
    and.push({ category: { $in: [f.category, ...kids.map((k) => String(k._id))] } });
  }
  if (f.brand) and.push({ brand: new RegExp(`^${escapeRe(f.brand)}$`, "i") });
  if (f.tag) and.push({ tags: f.tag });
  if (f.stock === "out") and.push({ stock: 0 });
  if (f.stock === "in") and.push({ stock: { $gt: 0 } });
  if (f.stock === "low") and.push({ $expr: { $lte: ["$stock", "$lowStockThreshold"] } });
  if (f.featured) and.push({ featured: f.featured === "1" });
  if (f.sale) and.push({ $expr: { $lt: ["$finalPrice", "$price"] } });
  if (f.image) and.push({ "images.0": { $exists: f.image === "with" } });
  if (f.variants) and.push({ "variants.0": { $exists: f.variants === "with" } });
  if (f.min || f.max) and.push({ finalPrice: { ...(f.min ? { $gte: Number(f.min) } : {}), ...(f.max ? { $lte: Number(f.max) } : {}) } });
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
    Product.find(filter).sort({ ...PRODUCT_SORTS[f.sort].sort, _id: 1 } as Record<string, 1 | -1>).skip((page - 1) * size).limit(size).select("slug sku name price salePrice finalPrice stock lowStockThreshold status featured category icon images variants").lean(),
    Product.countDocuments(filter),
  ]);
  return { rows: rows.map((p) => ({ id: String(p._id), slug: p.slug, sku: p.sku, name: p.name?.en ?? "", price: p.price, finalPrice: p.finalPrice, stock: p.stock, low: p.lowStockThreshold, status: p.status, featured: p.featured, category: String(p.category), icon: p.icon, image: p.images?.[0]?.url, variantCount: p.variants?.length ?? 0 })), total, pages: Math.max(1, Math.ceil(total / size)) };
}

export async function getProductForm(id: string): Promise<ProductFormData | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  await connectDb();
  const p = await Product.findById(id).lean();
  if (!p) return null;
  return {
    id: String(p._id), slug: p.slug, sku: p.sku, name: (p.name ?? { en: "", ar: "" }) as L, description: { en: p.description?.en ?? "", ar: p.description?.ar ?? "" }, category: String(p.category), brand: p.brand ?? undefined,
    price: p.price, salePrice: p.salePrice ?? null, saleStartsAt: toLocalInput(p.saleStartsAt), saleEndsAt: toLocalInput(p.saleEndsAt), stock: p.stock, lowStockThreshold: p.lowStockThreshold,
    status: p.status, featured: p.featured, tags: p.tags ?? [], icon: p.icon, hue: p.hue,
    images: (p.images ?? []).map((i) => ({ url: i.url ?? "", alt: { en: i.alt?.en ?? "", ar: i.alt?.ar ?? "" } })),
    variants: (p.variants ?? []).map((v) => ({ sku: v.sku, label: v.label as L, stock: v.stock, price: v.price ?? "", image: v.image ?? "", swatch: v.swatch ?? "" })),
    specs: (p.specs ?? []).map((s) => ({ label: s.label as L, value: s.value as L })),
    attrs: Object.fromEntries(Object.entries((p.attrs ?? {}) as unknown as Record<string, string>)),
    seo: { title: { en: p.seo?.title?.en ?? "", ar: p.seo?.title?.ar ?? "" }, description: { en: p.seo?.description?.en ?? "", ar: p.seo?.description?.ar ?? "" } },
  };
}

export async function getCategoryForm(id: string): Promise<CategoryFormData | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  await connectDb();
  const c = await Category.findById(id).lean();
  if (!c) return null;
  return {
    id: String(c._id), slug: c.slug, name: (c.name ?? { en: "", ar: "" }) as L, description: { en: c.description?.en ?? "", ar: c.description?.ar ?? "" }, parent: c.parent ? String(c.parent) : null, icon: c.icon, hue: c.hue,
    image: c.image ?? undefined, order: c.order, active: c.active, attributes: (c.attributes ?? []).map((a) => ({ key: a.key, label: a.label as L })),
    seo: { title: { en: c.seo?.title?.en ?? "", ar: c.seo?.title?.ar ?? "" }, description: { en: c.seo?.description?.en ?? "", ar: c.seo?.description?.ar ?? "" } },
  };
}

export async function listCategoriesAdmin() {
  await connectDb();
  const [rows, counts] = await Promise.all([Category.find().sort({ order: 1, "name.en": 1 }).lean(), Product.aggregate([{ $group: { _id: "$category", n: { $sum: 1 } } }])]);
  const cnt = new Map<string, number>(counts.map((c) => [String(c._id), c.n as number]));
  const top = rows.filter((c) => !c.parent);
  return top.flatMap((p) => [p, ...rows.filter((c) => String(c.parent) === String(p._id))]).map((c) => ({ id: String(c._id), slug: c.slug, name: c.name?.en ?? "", nameAr: c.name?.ar ?? "", depth: c.parent ? 1 : 0, active: c.active, order: c.order, icon: c.icon, products: cnt.get(String(c._id)) ?? 0 }));
}

export const INVENTORY_SORTS = { stock: "stock", name: "name.en", sku: "sku", updated: "updatedAt", threshold: "lowStockThreshold", status: "status" } as const;
export type InventoryFilters = { q: string; level: string; status: string; category: string; variants: string; from: string; to: string };

export async function listInventory(f: InventoryFilters, sort: keyof typeof INVENTORY_SORTS, dir: 1 | -1, page: number, size = 25) {
  await connectDb();
  const and: Record<string, unknown>[] = [{ status: f.status ? f.status : { $ne: "archived" } }];
  if (f.q) { const re = new RegExp(escapeRe(f.q.slice(0, 80)), "i"); and.push({ $or: [{ "name.en": re }, { sku: re }, { "variants.sku": re }, { brand: re }] }); }
  if (f.level === "out") and.push({ stock: 0 });
  if (f.level === "low") and.push({ stock: { $gt: 0 }, $expr: { $lte: ["$stock", "$lowStockThreshold"] } });
  if (f.level === "lowout") and.push({ $expr: { $lte: ["$stock", "$lowStockThreshold"] } });
  if (f.level === "ok") and.push({ $expr: { $gt: ["$stock", "$lowStockThreshold"] } });
  if (f.category && Types.ObjectId.isValid(f.category)) {
    const kids = await Category.find({ parent: f.category }, { _id: 1 }).lean();
    and.push({ category: { $in: [f.category, ...kids.map((k) => String(k._id))] } });
  }
  if (f.variants) and.push({ "variants.0": { $exists: f.variants === "with" } });
  if (f.from || f.to) and.push({ updatedAt: { ...(f.from ? { $gte: new Date(`${f.from}T00:00:00+04:00`) } : {}), ...(f.to ? { $lte: new Date(`${f.to}T23:59:59.999+04:00`) } : {}) } });
  const m = { $and: and };
  const [rows, total] = await Promise.all([Product.find(m).sort({ [INVENTORY_SORTS[sort]]: dir, "name.en": 1 }).skip((page - 1) * size).limit(size).select("sku name stock lowStockThreshold variants status images").lean(), Product.countDocuments(m)]);
  return { rows: rows.map((p) => ({ id: String(p._id), sku: p.sku, name: p.name?.en ?? "", image: p.images?.[0]?.url as string | undefined, stock: p.stock, low: p.lowStockThreshold, status: p.status, variants: (p.variants ?? []).map((v) => ({ sku: v.sku, label: v.label?.en ?? "", stock: v.stock })) })), total, pages: Math.max(1, Math.ceil(total / size)) };
}

export async function recentMovements(limit = 15) {
  await connectDb();
  const rows = await InventoryMovement.find().sort({ createdAt: -1 }).limit(limit).lean();
  return rows.map((m) => ({ id: String(m._id), sku: m.sku, delta: m.delta, reason: m.reason, note: m.note ?? "", at: (m as unknown as { createdAt: Date }).createdAt, order: m.order ? String(m.order) : "" }));
}
