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

export async function listProductsAdmin(q: { q?: string; status?: string; category?: string; low?: boolean; page: number }, size = 20) {
  await connectDb();
  const f: Record<string, unknown> = {};
  if (q.q) { const re = new RegExp(escapeRe(q.q.slice(0, 80)), "i"); f.$or = [{ "name.en": re }, { "name.ar": re }, { sku: re }, { brand: re }]; }
  if (q.status && ["draft", "published", "archived"].includes(q.status)) f.status = q.status;
  if (q.category && Types.ObjectId.isValid(q.category)) f.category = q.category;
  if (q.low) f.$expr = { $lte: ["$stock", "$lowStockThreshold"] };
  const [rows, total] = await Promise.all([
    Product.find(f).sort({ updatedAt: -1 }).skip((q.page - 1) * size).limit(size).select("slug sku name price salePrice finalPrice stock lowStockThreshold status featured category icon images").lean(),
    Product.countDocuments(f),
  ]);
  return { rows: rows.map((p) => ({ id: String(p._id), slug: p.slug, sku: p.sku, name: p.name?.en ?? "", price: p.price, finalPrice: p.finalPrice, stock: p.stock, low: p.lowStockThreshold, status: p.status, featured: p.featured, category: String(p.category), icon: p.icon, image: p.images?.[0]?.url })), total, pages: Math.max(1, Math.ceil(total / size)) };
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
    variants: (p.variants ?? []).map((v) => ({ sku: v.sku, label: v.label as L, stock: v.stock, price: v.price ?? "" })),
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

export async function listInventory(q: { q?: string; low?: boolean; page: number }, size = 25) {
  await connectDb();
  const f: Record<string, unknown> = { status: { $ne: "archived" } };
  if (q.q) { const re = new RegExp(escapeRe(q.q.slice(0, 80)), "i"); f.$or = [{ "name.en": re }, { sku: re }, { "variants.sku": re }]; }
  if (q.low) f.$expr = { $lte: ["$stock", "$lowStockThreshold"] };
  const [rows, total] = await Promise.all([Product.find(f).sort({ stock: 1, "name.en": 1 }).skip((q.page - 1) * size).limit(size).select("sku name stock lowStockThreshold variants status").lean(), Product.countDocuments(f)]);
  return { rows: rows.map((p) => ({ id: String(p._id), sku: p.sku, name: p.name?.en ?? "", stock: p.stock, low: p.lowStockThreshold, status: p.status, variants: (p.variants ?? []).map((v) => ({ sku: v.sku, label: v.label?.en ?? "", stock: v.stock })) })), total, pages: Math.max(1, Math.ceil(total / size)) };
}

export async function recentMovements(limit = 15) {
  await connectDb();
  const rows = await InventoryMovement.find().sort({ createdAt: -1 }).limit(limit).lean();
  return rows.map((m) => ({ id: String(m._id), sku: m.sku, delta: m.delta, reason: m.reason, note: m.note ?? "", at: (m as unknown as { createdAt: Date }).createdAt, order: m.order ? String(m.order) : "" }));
}
