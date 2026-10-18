import "server-only";
import { cache } from "react";
import { Types, type QueryFilter } from "mongoose";
import { connectDb } from "@/lib/db";
import { Category } from "@/models/category";
import { Product, type ProductDoc } from "@/models/product";
import { PAGE_SIZE, type Filters } from "./filters";

type L10n = { en: string; ar: string };

export type CategoryView = {
  id: string; slug: string; name: L10n; description?: Partial<L10n>; parent: string | null;
  icon: string; hue: number; attributes: { key: string; label: L10n }[];
  seo?: { title?: Partial<L10n>; description?: Partial<L10n> };
};

export type ProductCardData = {
  id: string; slug: string; sku: string; name: L10n; price: number; finalPrice: number;
  icon: string; hue: number; ratingAvg: number; ratingCount: number; stock: number; image?: string; brand?: string;
  hasVariants?: boolean; // has style/colour options: can only be added to the cart from its page, after choosing one
};

export type ProductDetail = ProductCardData & {
  description: Partial<L10n>; category: string; attrs: Record<string, string>;
  variants: { sku: string; label: L10n; stock: number; price: number; image?: string; swatch?: string }[];
  specs: { label: L10n; value: L10n }[]; lowStockThreshold: number; images: { url: string; alt?: Partial<L10n> }[];
  seo?: { title?: Partial<L10n>; description?: Partial<L10n> };
};

// Shapes of the lean() documents we read; Mongoose's inferred lean types don't model Map fields well.
type CardRow = { _id: unknown; slug: string; sku: string; name: L10n; price: number; finalPrice: number; icon: string; hue: number; ratingAvg: number; ratingCount: number; stock: number; images?: { url: string; alt?: Partial<L10n> }[]; brand?: string; variants?: { sku: string }[] };
type DetailRow = Omit<CardRow, "variants"> & { description: Partial<L10n>; category: unknown; attrs?: Record<string, string>; variants?: { sku: string; label: L10n; stock: number; price?: number; image?: string; swatch?: string }[]; specs?: { label: L10n; value: L10n }[]; lowStockThreshold: number; seo?: ProductDetail["seo"] };
type CatRow = { _id: unknown; slug: string; name: L10n; description?: Partial<L10n>; parent?: unknown; icon: string; hue: number; attributes?: CategoryView["attributes"]; seo?: CategoryView["seo"] };
type Bucket = { _id: string; count: number };

const clean = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function card(p: CardRow): ProductCardData {
  return {
    id: String(p._id), slug: p.slug, sku: p.sku, name: p.name, price: p.price, finalPrice: p.finalPrice,
    icon: p.icon, hue: p.hue, ratingAvg: p.ratingAvg, ratingCount: p.ratingCount, stock: p.stock,
    image: p.images?.[0]?.url, brand: p.brand,
  };
}
const catView = (c: CatRow): CategoryView => ({
  id: String(c._id), slug: c.slug, name: c.name, description: c.description, parent: c.parent ? String(c.parent) : null,
  icon: c.icon, hue: c.hue, attributes: c.attributes ?? [], seo: c.seo,
});

export const getCategories = cache(async (): Promise<CategoryView[]> => {
  await connectDb();
  const rows = await Category.find({ active: true }).sort({ order: 1 }).lean();
  return clean((rows as unknown as CatRow[]).map(catView));
});

/** Nav must survive a DB outage: degrade to an empty menu rather than failing every page. */
export async function getNavCategories() {
  try { return await getCategories(); } catch { return []; }
}

export async function getCategoryBySlug(slug: string) {
  const all = await getCategories();
  const cat = all.find((c) => c.slug === slug);
  if (!cat) return null;
  const children = all.filter((c) => c.parent === cat.id);
  const parent = cat.parent ? all.find((c) => c.id === cat.parent) ?? null : null;
  return { cat, children, parent, scopeIds: [cat.id, ...children.map((c) => c.id)] };
}

export type Scope = { categoryIds?: string[]; deals?: boolean; newOnly?: boolean };

function baseMatch(scope: Scope, q?: string, regexFallback = false): QueryFilter<ProductDoc> {
  const m: QueryFilter<ProductDoc> = { status: "published" };
  if (scope.categoryIds) m.category = { $in: scope.categoryIds.map((i) => new Types.ObjectId(i)) };
  if (scope.deals) m.$expr = { $lt: ["$finalPrice", "$price"] };
  if (scope.newOnly) m.createdAt = { $gte: new Date(Date.now() - 60 * 24 * 3600 * 1000) };
  if (q) {
    if (regexFallback) {
      const re = new RegExp(escapeRe(q), "i");
      m.$or = [{ "name.en": re }, { "name.ar": re }, { brand: re }, { sku: re }];
    } else {
      m.$or = [{ $text: { $search: q } }, { sku: q.toUpperCase() }];
    }
  }
  return m;
}

function applyFilters(m: QueryFilter<ProductDoc>, f: Filters, allowedAttrs: string[]) {
  const out: QueryFilter<ProductDoc> = { ...m };
  if (f.brand.length) out.brand = { $in: f.brand };
  if (f.minPrice != null || f.maxPrice != null) {
    out.finalPrice = { ...(f.minPrice != null && { $gte: f.minPrice }), ...(f.maxPrice != null && { $lte: f.maxPrice }) };
  }
  if (f.rating) out.ratingAvg = { $gte: f.rating };
  if (f.inStock) out.stock = { $gt: 0 };
  if (f.onSale && !m.$expr) out.$expr = { $lt: ["$finalPrice", "$price"] };
  for (const [k, vs] of Object.entries(f.attrs)) {
    if (allowedAttrs.includes(k) && vs.length) (out as Record<string, unknown>)[`attrs.${k}`] = { $in: vs };
  }
  return out;
}

const SORT = {
  price_asc: { finalPrice: 1, _id: 1 }, price_desc: { finalPrice: -1, _id: 1 }, newest: { createdAt: -1, _id: 1 },
  rating: { ratingAvg: -1, ratingCount: -1, _id: 1 }, popular: { soldCount: -1, viewCount: -1, _id: 1 },
  relevance: { featured: -1, soldCount: -1, _id: 1 },
} as const;

export type Facets = { brands: { value: string; count: number }[]; price: { min: number; max: number }; attrs: Record<string, { value: string; count: number }[]> };

export async function listProducts(scope: Scope, f: Filters, allowedAttrs: string[] = []) {
  await connectDb();
  let regex = false;
  let base = baseMatch(scope, f.q);
  let match = applyFilters(base, f, allowedAttrs);
  const run = async () => {
    const useText = !!f.q && !regex;
    const sort = useText && f.sort === "relevance" ? { score: { $meta: "textScore" }, _id: 1 as const } : SORT[f.sort];
    const q = Product.find(match, useText ? { score: { $meta: "textScore" } } : undefined)
      .sort(sort as Record<string, 1 | -1 | { $meta: "textScore" }>).skip((f.page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean();
    return Promise.all([q as unknown as Promise<CardRow[]>, Product.countDocuments(match)]);
  };
  let [rows, total] = await run();
  if (f.q && total === 0) { // partial-word fallback: text search only matches whole tokens
    regex = true;
    base = baseMatch(scope, f.q, true);
    match = applyFilters(base, f, allowedAttrs);
    [rows, total] = await run();
  }

  // Facets are computed on the scope+query (not the other filters) so options don't vanish as you filter.
  const facetKeys = allowedAttrs.slice(0, 6);
  const [agg] = await Product.aggregate([
    { $match: base },
    { $facet: {
      brands: [{ $match: { brand: { $ne: null } } }, { $group: { _id: "$brand", count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 20 }],
      price: [{ $group: { _id: null, min: { $min: "$finalPrice" }, max: { $max: "$finalPrice" } } }],
      ...Object.fromEntries(facetKeys.map((k) => [`a_${k}`, [
        { $match: { [`attrs.${k}`]: { $exists: true } } }, { $group: { _id: `$attrs.${k}`, count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 20 },
      ]])),
    } },
  ]);
  const facets: Facets = {
    brands: ((agg?.brands ?? []) as Bucket[]).map((b) => ({ value: b._id, count: b.count })),
    price: { min: Math.floor(agg?.price?.[0]?.min ?? 0), max: Math.ceil(agg?.price?.[0]?.max ?? 0) },
    attrs: Object.fromEntries(facetKeys.map((k) => [k, ((agg?.[`a_${k}`] ?? []) as Bucket[]).map((b) => ({ value: b._id, count: b.count }))])),
  };
  return { items: rows.map(card), total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), facets };
}

/** Simple collections for the home page. */
export async function getCollection(kind: "featured" | "deals" | "new" | "popular" | "viewed", limit = 4) {
  await connectDb();
  const filter: QueryFilter<ProductDoc> = { status: "published" };
  let sort: Record<string, 1 | -1> = { createdAt: -1 };
  if (kind === "featured") { filter.featured = true; sort = { soldCount: -1 }; }
  if (kind === "deals") { filter.$expr = { $lt: ["$finalPrice", "$price"] }; sort = { soldCount: -1 }; }
  if (kind === "popular") sort = { soldCount: -1 };
  if (kind === "viewed") sort = { viewCount: -1 };
  return ((await Product.find(filter).sort(sort).limit(limit).lean()) as unknown as CardRow[]).map(card);
}

export async function getProductBySlug(slug: string) {
  await connectDb();
  const p = (await Product.findOne({ slug: slug.toLowerCase(), status: "published" }).lean()) as unknown as DetailRow | null;
  if (!p) return null;
  const detail: ProductDetail = {
    ...card(p), description: p.description, category: String(p.category), attrs: p.attrs ?? {},
    variants: (p.variants ?? []).map((v) => ({ sku: v.sku, label: v.label, stock: v.stock, price: v.price ?? p.finalPrice, image: v.image || undefined, swatch: v.swatch || undefined })),
    specs: p.specs ?? [], lowStockThreshold: p.lowStockThreshold, images: (p.images ?? []).map((i) => ({ url: i.url, alt: i.alt })), seo: p.seo,
  };
  return clean(detail);
}

export async function getRelated(p: ProductDetail, limit = 4) {
  await connectDb();
  const rows = await Product.find({ status: "published", category: p.category, _id: { $ne: p.id } }).sort({ soldCount: -1 }).limit(limit).lean();
  return (rows as unknown as CardRow[]).map(card);
}

export async function getSitemapEntries() {
  await connectDb();
  const [products, cats] = await Promise.all([
    Product.find({ status: "published" }, { slug: 1, updatedAt: 1 }).limit(5000).lean(),
    Category.find({ active: true }, { slug: 1 }).lean(),
  ]);
  return { products: (products as unknown as { slug: string; updatedAt: Date }[]).map((p) => ({ slug: p.slug, updatedAt: p.updatedAt })), categories: (cats as unknown as { slug: string }[]).map((c) => c.slug) };
}

/** Counted view with abuse guard handled by the caller (see api/views). */
export async function incrementView(id: string) {
  if (!Types.ObjectId.isValid(id)) return;
  await connectDb();
  await Product.updateOne({ _id: id, status: "published" }, { $inc: { viewCount: 1 } });
}

/** If `slug` is a previous slug of a product/category, return the current one (for 301 redirects). */
export async function findSlugRedirect(kind: "product" | "category", slug: string): Promise<string | null> {
  await connectDb();
  const s = slug.toLowerCase();
  if (kind === "product") {
    const p = (await Product.findOne({ slugHistory: s, status: "published" }, { slug: 1 }).lean()) as unknown as { slug: string } | null;
    return p?.slug ?? null;
  }
  const c = (await Category.findOne({ slugHistory: s, active: true }, { slug: 1 }).lean()) as unknown as { slug: string } | null;
  return c?.slug ?? null;
}

export type Suggestion = { type: "product" | "category"; slug: string; name: L10n; icon: string; price?: number; image?: string };

/**
 * Lightweight autocomplete: whole-word text search first (indexed), then a prefix match on name/brand/SKU. Bounded, projection-only.
 * Swap for a dedicated search engine when the catalogue outgrows MongoDB text search.
 */
export async function suggest(q: string, limit = 6): Promise<Suggestion[]> {
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  await connectDb();
  const base = { status: "published" } as const;
  const proj = { slug: 1, name: 1, icon: 1, finalPrice: 1, images: 1 } as const;
  let rows = (await Product.find({ ...base, $text: { $search: term } }, proj).sort({ soldCount: -1 }).limit(limit).lean()) as unknown as { slug: string; name: L10n; icon: string; finalPrice: number; images?: { url?: string }[] }[];
  if (rows.length < limit) {
    const re = new RegExp(`(^|\\s)${escapeRe(term)}`, "i");
    const more = (await Product.find({ ...base, slug: { $nin: rows.map((r) => r.slug) }, $or: [{ "name.en": re }, { "name.ar": re }, { brand: re }, { sku: new RegExp(`^${escapeRe(term)}`, "i") }] }, proj).sort({ soldCount: -1 }).limit(limit - rows.length).lean()) as unknown as typeof rows;
    rows = [...rows, ...more];
  }
  const cats = (await getCategories()).filter((c) => c.name.en.toLowerCase().includes(term.toLowerCase()) || c.name.ar.includes(term)).slice(0, 2);
  return [
    ...cats.map((c) => ({ type: "category" as const, slug: c.slug, name: c.name, icon: c.icon })),
    ...rows.map((r) => ({ type: "product" as const, slug: r.slug, name: r.name, icon: r.icon, price: r.finalPrice, image: r.images?.[0]?.url || undefined })),
  ].slice(0, limit);
}

/** Published product count per category id (used to show only categories that actually have products). */
export const getCategoryCounts = cache(async (): Promise<Record<string, number>> => {
  await connectDb();
  const rows = await Product.aggregate<{ _id: unknown; n: number }>([{ $match: { status: "published" } }, { $group: { _id: "$category", n: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((r) => [String(r._id), r.n]));
});
