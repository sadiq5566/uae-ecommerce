import "server-only";
import { cache } from "react";
import { cachedFor } from "@/lib/cross-request-cache";
import { Types, type QueryFilter } from "mongoose";
import { connectDb } from "@/lib/db";
import { ProductModel } from "../../../lib/models/Product";
import { CollectionModel } from "../../../lib/models/Collection";
import { swatchFor } from "../../../lib/variants";
import { categoryLabel } from "../../../lib/catalog-shared";
import { PAGE_SIZE, type Filters } from "./filters";

// Reads the shared flat catalogue (lib/models/Product.ts + Collection.ts, identical in every storefront) and adapts it
// to the DTOs this storefront's components use: names become { en, ar } (same text), price = original price, finalPrice = selling price.
type L10n = { en: string; ar: string };
const both = (s: string): L10n => ({ en: s, ar: s });

export type CategoryView = {
  id: string; slug: string; name: L10n; description?: Partial<L10n>; parent: string | null;
  icon: string; hue: number; image?: string; attributes: { key: string; label: L10n }[];
  seo?: { title?: Partial<L10n>; description?: Partial<L10n> };
};

export type ProductCardData = {
  id: string; slug: string; sku: string; name: L10n; price: number; finalPrice: number;
  icon: string; hue: number; ratingAvg: number; ratingCount: number; stock: number; image?: string; image2?: string; brand?: string;
  hasVariants?: boolean; // has colour/size options: can only be added to the cart from its page, after choosing one
};

export type ProductDetail = ProductCardData & {
  description: Partial<L10n>; category: string; attrs: Record<string, string>;
  variants: { sku: string; label: L10n; stock: number; price: number; image?: string; swatch?: string; color?: string; size?: string }[];
  specs: { label: L10n; value: L10n }[]; lowStockThreshold: number; images: { url: string; alt?: Partial<L10n> }[];
  seo?: { title?: Partial<L10n>; description?: Partial<L10n> };
};

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/** What the shop may show: active AND not merged into another product (mergedInto missing/null), whatever the status says. */
const ACTIVE = { status: "active", mergedInto: null } as const;
const clean = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ICONS: Record<string, string> = { watches: "⌚", jewelry: "💍", bags: "👜", perfume: "🧴", accessories: "🕶️" };
const hueOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

function card(p: Doc): ProductCardData {
  const price = Math.max(p.priceFrom ?? 0, p.priceTo ?? 0);
  return {
    id: String(p._id), slug: p.slug, sku: p.sku, name: both(p.name), price, finalPrice: p.priceTo,
    icon: ICONS[p.category] ?? "📦", hue: hueOf(p.category ?? ""), ratingAvg: p.ratingAvg ?? 0, ratingCount: p.ratingCount ?? 0, stock: p.stock ?? 0,
    image: p.images?.[0]?.url, image2: p.images?.[1]?.url, brand: p.brand, hasVariants: (p.variants?.length ?? 0) > 0,
  };
}

const catView = (slug: string, doc?: Doc): CategoryView => ({
  id: slug, slug, name: both(String(doc?.name ?? categoryLabel(slug)).replace(/^All /, "")), description: doc?.description ? both(doc.description) : undefined, parent: null,
  icon: ICONS[slug] ?? "📦", hue: hueOf(slug), image: doc?.image || undefined,
  attributes: [{ key: "color", label: both("Colour") }, { key: "size", label: both("Size") }],
});

// Categories = every category value on a published product, enriched by its Collection document (type "category"). Cached 60 s.
const loadCategories = cachedFor("categories", 60, async (): Promise<CategoryView[]> => {
  await connectDb();
  const [slugs, docs] = await Promise.all([ProductModel.distinct("category", ACTIVE) as Promise<string[]>, CollectionModel.find({ type: "category" }).sort({ sortOrder: 1 }).lean<Doc[]>()]);
  const byParent = new Map(docs.map((d) => [d.parent, d]));
  const order = docs.map((d) => d.parent).filter((s): s is string => !!s);
  return clean([...new Set([...order, ...slugs])].filter((s) => slugs.includes(s)).map((s) => catView(s, byParent.get(s))));
});
export const getCategories = cache(loadCategories);

/** Nav must survive a DB outage: degrade to an empty menu rather than failing every page. */
export async function getNavCategories() {
  try { return await getCategories(); } catch { return []; }
}

export async function getCategoryBySlug(slug: string) {
  const cat = (await getCategories()).find((c) => c.slug === slug.toLowerCase());
  if (!cat) return null;
  return { cat, children: [] as CategoryView[], parent: null as CategoryView | null, scopeIds: [cat.id] };
}

export type Scope = { categoryIds?: string[]; deals?: boolean; newOnly?: boolean };

function baseMatch(scope: Scope, q?: string, regexFallback = false): QueryFilter<Doc> {
  const m: QueryFilter<Doc> = { ...ACTIVE };
  if (scope.categoryIds) m.category = { $in: scope.categoryIds };
  if (scope.deals) m.$expr = { $lt: ["$priceTo", "$priceFrom"] };
  if (scope.newOnly) m.createdAt = { $gte: new Date(Date.now() - 60 * 24 * 3600 * 1000) };
  if (q) {
    if (regexFallback) {
      const re = new RegExp(escapeRe(q), "i");
      m.$or = [{ name: re }, { model: re }, { brand: re }, { sku: re }, { tags: re }];
    } else {
      m.$or = [{ $text: { $search: q } }, { sku: q.toUpperCase() }];
    }
  }
  return m;
}

const ATTR_FIELD: Record<string, string> = { color: "variants.color", size: "variants.size" };

function applyFilters(m: QueryFilter<Doc>, f: Filters, allowedAttrs: string[]) {
  const out: QueryFilter<Doc> = { ...m };
  if (f.brand.length) out.brand = { $in: f.brand };
  if (f.minPrice != null || f.maxPrice != null) {
    out.priceTo = { ...(f.minPrice != null && { $gte: f.minPrice }), ...(f.maxPrice != null && { $lte: f.maxPrice }) };
  }
  if (f.rating) out.ratingAvg = { $gte: f.rating };
  if (f.inStock) out.stock = { $gt: 0 };
  if (f.onSale && !m.$expr) out.$expr = { $lt: ["$priceTo", "$priceFrom"] };
  for (const [k, vs] of Object.entries(f.attrs)) {
    if (ATTR_FIELD[k] && allowedAttrs.includes(k) && vs.length) (out as Record<string, unknown>)[ATTR_FIELD[k]] = { $in: vs };
  }
  return out;
}

const SORT = {
  price_asc: { priceTo: 1, _id: 1 }, price_desc: { priceTo: -1, _id: 1 }, newest: { createdAt: -1, _id: 1 },
  rating: { ratingAvg: -1, ratingCount: -1, _id: 1 }, popular: { soldCount: -1, viewCount: -1, _id: 1 },
  relevance: { isFeatured: -1, soldCount: -1, _id: 1 },
} as const;

export type Facets = { brands: { value: string; count: number }[]; price: { min: number; max: number }; attrs: Record<string, { value: string; count: number }[]> };

/** Only what a product card shows (first image only) — avoids loading descriptions and every gallery image per row. */
const CARD_PROJECTION = { slug: 1, sku: 1, name: 1, category: 1, priceFrom: 1, priceTo: 1, ratingAvg: 1, ratingCount: 1, stock: 1, brand: 1, "variants.sku": 1, images: { $slice: 2 } };

async function computeFacets(base: QueryFilter<Doc>, allowedAttrs: string[]): Promise<Facets> {
  const keys = allowedAttrs.filter((k) => ATTR_FIELD[k]);
  const [agg] = await ProductModel.aggregate([
    { $match: base },
    { $facet: {
      brands: [{ $match: { brand: { $ne: null } } }, { $group: { _id: "$brand", count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 20 }],
      price: [{ $group: { _id: null, min: { $min: "$priceTo" }, max: { $max: "$priceTo" } } }],
      ...Object.fromEntries(keys.map((k) => [`a_${k}`, [
        { $unwind: "$variants" }, { $match: { [ATTR_FIELD[k]]: { $nin: [null, ""] } } }, { $group: { _id: { v: `$${ATTR_FIELD[k]}`, p: "$_id" } } },
        { $group: { _id: "$_id.v", count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 24 },
      ]])),
    } },
  ]);
  return {
    brands: ((agg?.brands ?? []) as { _id: string; count: number }[]).map((b) => ({ value: b._id, count: b.count })),
    price: { min: Math.floor(agg?.price?.[0]?.min ?? 0), max: Math.ceil(agg?.price?.[0]?.max ?? 0) },
    attrs: Object.fromEntries(keys.map((k) => [k, ((agg?.[`a_${k}`] ?? []) as { _id: string; count: number }[]).map((b) => ({ value: b._id, count: b.count }))])),
  };
}

export async function listProducts(scope: Scope, f: Filters, allowedAttrs: string[] = []) {
  await connectDb();
  let regex = false;
  let base = baseMatch(scope, f.q);
  let match = applyFilters(base, f, allowedAttrs);
  const run = async () => {
    const useText = !!f.q && !regex;
    const sort = useText && f.sort === "relevance" ? { score: { $meta: "textScore" }, _id: 1 as const } : SORT[f.sort];
    const q = ProductModel.find(match, useText ? { ...CARD_PROJECTION, score: { $meta: "textScore" } } : CARD_PROJECTION)
      .sort(sort as Record<string, 1 | -1 | { $meta: "textScore" }>).skip((f.page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean();
    return Promise.all([q as unknown as Promise<Doc[]>, ProductModel.countDocuments(match)]);
  };
  // Facets depend only on scope+query, so they run alongside the product page instead of after it.
  let facetsP = computeFacets(base, allowedAttrs);
  let [rows, total] = await run();
  if (f.q && total === 0) { // partial-word fallback: text search only matches whole tokens
    regex = true;
    base = baseMatch(scope, f.q, true);
    match = applyFilters(base, f, allowedAttrs);
    facetsP = computeFacets(base, allowedAttrs);
    [rows, total] = await run();
  }

  const facets = await facetsP;
  return { items: rows.map(card), total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), facets };
}

/** Simple collections for the home page. `categories` limits them to those category slugs (the lead categories on the home page). */
export async function getCollection(kind: "featured" | "deals" | "new" | "popular" | "viewed" | "category", limit = 4, categories?: string[]) {
  await connectDb();
  const filter: QueryFilter<Doc> = { ...ACTIVE, "images.0": { $exists: true } };
  if (categories?.length) filter.category = { $in: categories };
  let sort: Record<string, 1 | -1> = { createdAt: -1 };
  if (kind === "featured") { filter.isFeatured = true; sort = { soldCount: -1 }; }
  if (kind === "deals") { filter.$expr = { $lt: ["$priceTo", "$priceFrom"] }; sort = { soldCount: -1 }; }
  if (kind === "popular" || kind === "category") sort = { soldCount: -1, isFeatured: -1, viewCount: -1 };
  if (kind === "viewed") sort = { viewCount: -1 };
  return ((await ProductModel.find(filter, CARD_PROJECTION).sort({ ...sort, _id: 1 }).limit(limit).lean()) as unknown as Doc[]).map(card);
}

/** One picture + product count per category (best-selling product that has a photo). Categories have no image of their own, so this feeds the home tiles and menus. */
export const getShowcase = cachedFor("showcase", 300, async (): Promise<Record<string, { image?: string; count: number }>> => {
  await connectDb();
  const rows = await ProductModel.aggregate<{ _id: string; image?: string; count: number }>([
    { $match: ACTIVE },
    { $sort: { isFeatured: -1, soldCount: -1, viewCount: -1 } },
    { $group: { _id: "$category", count: { $sum: 1 }, image: { $first: { $arrayElemAt: ["$images.url", 0] } } } },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id, { image: r.image || undefined, count: r.count }]));
});

export async function getProductBySlug(slug: string) {
  await connectDb();
  const p = (await ProductModel.findOne({ slug: slug.toLowerCase(), ...ACTIVE }).lean()) as unknown as Doc | null;
  if (!p) return null;
  const text = p.longDescription || p.shortDescription || "";
  const detail: ProductDetail = {
    ...card(p), description: both(text), category: p.category, attrs: {},
    variants: (p.variants ?? []).map((v: Doc) => ({
      sku: v.sku, label: both([v.color, v.size].filter(Boolean).join(" / ") || v.sku), stock: v.stock ?? 0, price: v.price ?? p.priceTo,
      image: v.image || undefined, swatch: v.color ? swatchFor(v.color) : undefined, color: v.color || undefined, size: v.size || undefined,
    })),
    specs: [["Brand", p.brand], ["Model", p.model], ["Finish", p.finish]].filter(([, v]) => v).map(([k, v]) => ({ label: both(k), value: both(v) })),
    lowStockThreshold: p.lowStockThreshold ?? 5, images: (p.images ?? []).map((i: Doc) => ({ url: i.url, alt: both(i.alt || p.name) })), seo: p.seo?.title || p.seo?.description ? { title: p.seo.title ? both(p.seo.title) : undefined, description: p.seo.description ? both(p.seo.description) : undefined } : undefined,
  };
  return clean(detail);
}

export async function getRelated(p: ProductDetail, limit = 4) {
  await connectDb();
  const rows = await ProductModel.find({ ...ACTIVE, category: p.category, _id: { $ne: p.id } }).sort({ soldCount: -1 }).limit(limit).lean();
  return (rows as unknown as Doc[]).map(card);
}

export async function getSitemapEntries() {
  await connectDb();
  const [products, cats] = await Promise.all([
    ProductModel.find(ACTIVE, { slug: 1, updatedAt: 1 }).limit(5000).lean(),
    getCategories(),
  ]);
  return { products: (products as unknown as { slug: string; updatedAt: Date }[]).map((p) => ({ slug: p.slug, updatedAt: p.updatedAt })), categories: cats.map((c) => c.slug) };
}

/** Counted view with abuse guard handled by the caller (see api/views). */
export async function incrementView(id: string) {
  if (!Types.ObjectId.isValid(id)) return;
  await connectDb();
  await ProductModel.updateOne({ _id: id, ...ACTIVE }, { $inc: { viewCount: 1 } });
}

/** If `slug` is a previous slug of a product, return the current one (for 301 redirects). Categories keep their slug. */
export async function findSlugRedirect(kind: "product" | "category", slug: string): Promise<string | null> {
  if (kind !== "product") return null;
  await connectDb();
  const p = (await ProductModel.findOne({ slugHistory: slug.toLowerCase(), ...ACTIVE }, { slug: 1 }).lean()) as unknown as { slug: string } | null;
  if (p?.slug) return p.slug;
  // An old one-size product URL goes to the product it was merged into (colour / size variants).
  const old = (await ProductModel.findOne({ slug: slug.toLowerCase(), mergedInto: { $ne: null } }, { mergedInto: 1 }).lean()) as unknown as { mergedInto?: string } | null;
  if (!old?.mergedInto) return null;
  const main = (await ProductModel.findOne({ ...ACTIVE, sku: old.mergedInto }, { slug: 1 }).lean()) as unknown as { slug: string } | null;
  return main?.slug ?? null;
}

export type Suggestion = { type: "product" | "category"; slug: string; name: L10n; icon: string; price?: number; image?: string };

/** Lightweight autocomplete: whole-word text search first (indexed), then a prefix match on name/brand/SKU. Bounded, projection-only. */
export async function suggest(q: string, limit = 6): Promise<Suggestion[]> {
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  await connectDb();
  const proj = { slug: 1, name: 1, category: 1, priceTo: 1, images: { $slice: 1 } } as const;
  let rows = (await ProductModel.find({ ...ACTIVE, $text: { $search: term } }, proj).sort({ soldCount: -1 }).limit(limit).lean()) as unknown as Doc[];
  if (rows.length < limit) {
    const re = new RegExp(`(^|\\s)${escapeRe(term)}`, "i");
    const more = (await ProductModel.find({ ...ACTIVE, slug: { $nin: rows.map((r) => r.slug) }, $or: [{ name: re }, { brand: re }, { sku: new RegExp(`^${escapeRe(term)}`, "i") }] }, proj).sort({ soldCount: -1 }).limit(limit - rows.length).lean()) as unknown as Doc[];
    rows = [...rows, ...more];
  }
  const cats = (await getCategories()).filter((c) => c.name.en.toLowerCase().includes(term.toLowerCase())).slice(0, 2);
  return [
    ...cats.map((c) => ({ type: "category" as const, slug: c.slug, name: c.name, icon: c.icon })),
    ...rows.map((r) => ({ type: "product" as const, slug: r.slug, name: both(r.name), icon: ICONS[r.category] ?? "📦", price: r.priceTo, image: r.images?.[0]?.url || undefined })),
  ].slice(0, limit);
}

/** Published product count per category slug (used to show only categories that actually have products). */
export const getCategoryCounts = cache(async (): Promise<Record<string, number>> => {
  await connectDb();
  const rows = await ProductModel.aggregate<{ _id: string; n: number }>([{ $match: ACTIVE }, { $group: { _id: "$category", n: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((r) => [r._id, r.n]));
});
