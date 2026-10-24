import "server-only";
import { connectDb } from "@/lib/db";
import { cachedFor } from "@/lib/cross-request-cache";
import { BrandModel } from "../../../lib/models/Brand";
import { ProductModel } from "../../../lib/models/Product";
import { isPlaceholderBrand } from "../../../lib/brands";
import { slugify } from "../../../lib/utils";

// A brand is the maker of a product (Rolex, Zegna...). It is NOT a category: a product has a category (watches, bags...) and a brand.
// Products keep the brand NAME in `brand`; the Brand collection holds the brand's page (logo, banner, description, order).

export type BrandView = { id: string; slug: string; name: string; description: string; logo: string; image: string; isFeatured: boolean; isActive: boolean; sortOrder: number };
type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ACTIVE = { status: "active", mergedInto: null } as const;
export const brandRegex = (name: string) => new RegExp(`^\\s*${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
const view = (d: Doc): BrandView => ({ id: String(d._id), slug: d.slug, name: d.name, description: d.description ?? "", logo: d.logo ?? "", image: d.image ?? "", isFeatured: !!d.isFeatured, isActive: d.isActive !== false, sortOrder: d.sortOrder ?? 0 });

/** Makes sure a Brand document exists for this name (called when a product is saved or imported). Placeholder shop names are ignored. */
export async function ensureBrand(name?: string | null) {
  const n = (name ?? "").trim();
  if (!n || isPlaceholderBrand(n)) return;
  const slug = slugify(n);
  if (!slug) return;
  await connectDb();
  await BrandModel.updateOne({ slug }, { $setOnInsert: { slug, name: n } }, { upsert: true });
}

/** Every brand used by a product gets its Brand document, so nothing in the catalogue is missing from the brands list. */
export async function syncBrands() {
  await connectDb();
  const used = ((await ProductModel.distinct("brand")) as string[]).filter((b) => b && b.trim() && !isPlaceholderBrand(b));
  const have = new Set((await BrandModel.find({}, { name: 1 }).lean<{ name: string }[]>()).map((b) => b.name.toLowerCase()));
  for (const b of used) if (!have.has(b.trim().toLowerCase())) await ensureBrand(b);
}

/** Admin list: every brand with how many products (all / live) carry its name. */
export async function listBrandsAdmin() {
  await syncBrands();
  const [brands, counts] = await Promise.all([
    BrandModel.find().sort({ sortOrder: 1, name: 1 }).lean(),
    ProductModel.aggregate<{ _id: string; all: number; live: number }>([
      { $match: { mergedInto: null } },
      { $group: { _id: { $toLower: { $trim: { input: { $ifNull: ["$brand", ""] } } } }, all: { $sum: 1 }, live: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } } } },
    ]),
  ]);
  const by = new Map(counts.map((c) => [c._id, c]));
  return brands.map((d) => {
    const b = view(d);
    const c = by.get(b.name.trim().toLowerCase());
    return { ...b, products: c?.all ?? 0, live: c?.live ?? 0 };
  });
}

export async function getBrandForm(id: string): Promise<BrandView | null> {
  await connectDb();
  try {
    const d = await BrandModel.findById(id).lean();
    return d ? view(d) : null;
  } catch {
    return null;
  }
}

/** Brand names for the product form's suggestions. */
export async function brandNames(): Promise<string[]> {
  await syncBrands();
  return (await BrandModel.find({ isActive: true }, { name: 1 }).sort({ name: 1 }).lean<{ name: string }[]>()).map((b) => b.name);
}

export type StoreBrand = { slug: string; name: string; logo: string; image: string; count: number; description: string; isFeatured: boolean };
let synced = false;

/** Brands that have live products, for the menu, home page and /brands: featured first, then the biggest. Cached for 5 minutes. */
export const getStoreBrands = cachedFor("storeBrands", 300, async (): Promise<StoreBrand[]> => {
  await connectDb();
  if (!synced) {
    synced = true; // once per server start; later new brands arrive through product save / import
    await syncBrands().catch(() => { synced = false; });
  }
  const [brands, counts] = await Promise.all([
    BrandModel.find({ isActive: true }).lean<Doc[]>(),
    ProductModel.aggregate<{ _id: string; count: number; image?: string }>([
      { $match: ACTIVE },
      { $sort: { isFeatured: -1, soldCount: -1, viewCount: -1 } },
      { $group: { _id: { $toLower: { $trim: { input: { $ifNull: ["$brand", ""] } } } }, count: { $sum: 1 }, image: { $first: { $arrayElemAt: ["$images.url", 0] } } } },
    ]),
  ]);
  const by = new Map(counts.map((c) => [c._id, c]));
  return brands
    .map((b): StoreBrand => {
      const c = by.get(String(b.name).trim().toLowerCase());
      return { slug: b.slug, name: b.name, logo: b.logo ?? "", image: b.image || c?.image || "", count: c?.count ?? 0, description: b.description ?? "", isFeatured: !!b.isFeatured };
    })
    .filter((b) => b.count > 0)
    .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || b.count - a.count || a.name.localeCompare(b.name));
});

export async function getBrandBySlug(slug: string) {
  await connectDb();
  const d = await BrandModel.findOne({ slug, isActive: true }).lean();
  return d ? view(d) : null;
}
