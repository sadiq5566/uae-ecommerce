"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { FORBIDDEN, actor } from "@/lib/admin/guard";
import { audit } from "@/lib/admin/audit";
import { fail, formObj, isDupKey, issues } from "@/lib/admin/common";
import type { FormState } from "@/features/auth/schemas";
import { Category } from "@/models/category";
import { InventoryMovement } from "@/models/inventory-movement";
import { Product } from "@/models/product";
import { slugify } from "../../../../lib/utils";
import { categorySchema, productSchema, stockAdjustSchema } from "./schemas";
import { parseProductFilters, productFilterQuery } from "./queries";

const refresh = () => revalidatePath("/[lang]", "layout");
/** A category seen for the first time gets its "All <Category>" collection page (same rule as the CSV importer). */
async function ensureCategoryPage(cat: string) {
  await Category.updateOne({ slug: `all-${cat}` }, { $setOnInsert: { slug: `all-${cat}`, name: "All " + cat.charAt(0).toUpperCase() + cat.slice(1).replace(/-/g, " "), description: "", image: "", type: "category", parent: cat, sortOrder: 50 } }, { upsert: true });
}

/* ------------------------------ products ------------------------------ */

export async function saveProductAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor("products:write");
  if (!user) return { error: FORBIDDEN };
  const parsed = productSchema.safeParse(formObj(fd));
  if (!parsed.success) return fail(issues(parsed.error), fd);
  const p = parsed.data;
  await connectDb();

  const hasVariants = p.variants.length > 0;
  const stock = hasVariants ? p.variants.reduce((a, v) => a + v.stock, 0) : p.stock;
  const variants = p.variants.map((v) => ({ sku: v.sku.toUpperCase(), color: v.color, size: v.size, stock: v.stock, price: v.price, image: v.image }));

  // Variant SKUs must not collide with any other product's SKU / variant SKU.
  const clash = await Product.findOne({ _id: { $ne: p.id || new Types.ObjectId() }, $or: [{ sku: { $in: [p.sku.toUpperCase(), ...variants.map((v) => v.sku)] } }, { "variants.sku": { $in: [p.sku.toUpperCase(), ...variants.map((v) => v.sku)] } }] }).select("sku").lean();
  if (clash) return fail({ sku: `SKU already used by product ${clash.sku}` }, fd);

  const base = {
    slug: p.slug || slugify(p.name), sku: p.sku.toUpperCase(), name: p.name, shortDescription: p.shortDescription, longDescription: p.longDescription,
    category: p.category, subcategory: p.subcategory, brand: p.brand, model: p.model || p.name, finish: p.finish ?? "",
    priceFrom: p.priceFrom, priceTo: p.priceTo, currency: "AED", stock, lowStockThreshold: p.lowStockThreshold, status: p.status,
    isFeatured: p.isFeatured, isNewArrival: p.isNewArrival, isMostWanted: p.isMostWanted, tags: p.tags, highlights: p.highlights, includedItems: p.includedItems,
    images: p.images.map((i) => ({ url: i.url, alt: i.alt?.en || p.name })), variants,
    seo: { title: p.seoTitle || undefined, description: p.seoDesc || undefined },
  };

  try {
    if (p.id) {
      if (!Types.ObjectId.isValid(p.id)) return { error: "Not found" };
      const doc = await Product.findById(p.id);
      if (!doc) return { error: "Product not found" };
      // Slug changes keep the old slug so old URLs 301-redirect.
      const clashSlug = base.slug !== doc.slug && (await Product.exists({ _id: { $ne: doc._id }, slugHistory: base.slug }));
      if (clashSlug) return fail({ slug: "That slug was used by another product before" }, fd);
      const history = new Set<string>(doc.slugHistory ?? []);
      if (doc.slug !== base.slug) history.add(doc.slug);
      history.delete(base.slug);
      const before = new Map<string, number>(doc.variants?.length ? doc.variants.map((v) => [v.sku, v.stock]) : [[doc.sku, doc.stock]]);
      doc.set({ ...base, slugHistory: [...history] });
      await doc.save();
      const after = new Map<string, number>(hasVariants ? variants.map((v) => [v.sku, v.stock]) : [[base.sku, stock]]);
      const moves = [...after].map(([sku, qty]) => ({ sku, delta: qty - (before.get(sku) ?? 0) })).filter((m) => m.delta !== 0);
      if (moves.length) await InventoryMovement.insertMany(moves.map((m) => ({ product: doc._id, sku: m.sku, delta: m.delta, reason: "manual_adjustment", actor: user.id, note: "Edited in product form" })));
      await ensureCategoryPage(base.category);
      await audit(user, "product.update", "product", String(doc._id), `Updated product ${base.sku}`, { status: p.status, slugChanged: doc.slug !== base.slug });
      refresh(); revalidatePath("/admin/products");
      return { ok: true };
    }
    const doc = await Product.create(base);
    if (stock > 0) await InventoryMovement.insertMany((hasVariants ? variants : [{ sku: base.sku, stock }]).filter((v) => v.stock > 0).map((v) => ({ product: doc._id, sku: v.sku, delta: v.stock, reason: "restock", actor: user.id, note: "Initial stock" })));
    await ensureCategoryPage(base.category);
    await audit(user, "product.create", "product", String(doc._id), `Created product ${base.sku}`);
    refresh(); revalidatePath("/admin/products");
  } catch (e) {
    if (isDupKey(e, "slug")) return fail({ slug: "This slug is already in use" }, fd);
    if (isDupKey(e, "sku")) return fail({ sku: "This SKU is already in use" }, fd);
    throw e;
  }
  redirect("/admin/products?saved=1");
}

const BULK_CAP = 10_000;

/** Bulk change on selected products (`ids`) or on EVERY product matching the current list filters (`scope=filter`, rebuilt server-side from `filterQs`). */
export async function bulkProductsAction(fd: FormData) {
  const user = await actor("products:write");
  if (!user) return;
  const op = String(fd.get("op"));
  if (!["publish", "unpublish", "archive", "delete", "feature", "unfeature"].includes(op)) return;
  await connectDb();
  const byFilter = String(fd.get("scope")) === "filter";
  const filterQs = byFilter ? String(fd.get("filterQs") ?? "").slice(0, 2000) : "";
  let ids: string[];
  if (byFilter) {
    const filter = await productFilterQuery(parseProductFilters(Object.fromEntries(new URLSearchParams(filterQs))));
    ids = (await Product.find(filter).select("_id").limit(BULK_CAP).lean()).map((p) => String(p._id));
  } else ids = fd.getAll("ids").map(String).filter((i) => Types.ObjectId.isValid(i)).slice(0, 1000);
  if (!ids.length) return;
  const detail = byFilter ? { count: ids.length, filter: filterQs } : { ids };
  if (op === "publish" || op === "unpublish" || op === "archive") {
    const status = op === "publish" ? "active" : op === "archive" ? "archived" : "draft";
    await Product.updateMany({ _id: { $in: ids } }, { status });
    await audit(user, `product.bulk_${op}`, "product", undefined, `${op} ${ids.length} product(s)${byFilter ? " (all matching filter)" : ""}`, detail);
  } else if (op === "feature" || op === "unfeature") {
    await Product.updateMany({ _id: { $in: ids } }, { isFeatured: op === "feature" });
    await audit(user, `product.bulk_${op}`, "product", undefined, `${op} ${ids.length} product(s)${byFilter ? " (all matching filter)" : ""}`, detail);
  } else {
    // Only non-active products can be deleted; active ones must be unpublished/archived first (safety).
    const res = await Product.deleteMany({ _id: { $in: ids }, status: { $ne: "active" } });
    await audit(user, "product.bulk_delete", "product", undefined, `Deleted ${res.deletedCount} of ${ids.length} selected product(s)${byFilter ? " (all matching filter)" : ""}`, detail);
  }
  refresh(); revalidatePath("/admin/products");
}

export async function deleteProductAction(fd: FormData) {
  const user = await actor("products:write");
  const id = String(fd.get("id") ?? "");
  if (!user || !Types.ObjectId.isValid(id)) return;
  await connectDb();
  const res = await Product.findOneAndDelete({ _id: id, status: { $ne: "active" } }); // orders keep their own snapshot
  if (res) await audit(user, "product.delete", "product", id, `Deleted product ${res.sku}`);
  refresh(); redirect("/admin/products");
}

/* ----------------------------- categories / collections ----------------------------- */

export async function saveCategoryAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor("categories:write");
  if (!user) return { error: FORBIDDEN };
  const parsed = categorySchema.safeParse(formObj(fd));
  if (!parsed.success) return fail(issues(parsed.error), fd);
  const c = parsed.data;
  await connectDb();
  const base = { slug: c.slug || slugify(c.name), name: c.name, description: c.description, image: c.image || "", type: c.type, parent: c.parent, sortOrder: c.sortOrder };
  try {
    if (c.id) {
      if (!Types.ObjectId.isValid(c.id)) return { error: "Not found" };
      const res = await Category.updateOne({ _id: c.id }, { $set: base });
      if (!res.matchedCount) return { error: "Collection not found" };
      await audit(user, "category.update", "category", c.id, `Updated collection ${base.slug}`);
      refresh(); revalidatePath("/admin/categories");
      return { ok: true };
    }
    const doc = await Category.create(base);
    await audit(user, "category.create", "category", String(doc._id), `Created collection ${base.slug}`);
    refresh(); revalidatePath("/admin/categories");
  } catch (e) {
    if (isDupKey(e, "slug")) return fail({ slug: "This slug is already in use" }, fd);
    throw e;
  }
  redirect("/admin/categories?saved=1");
}

export async function deleteCategoryAction(fd: FormData): Promise<void> {
  const user = await actor("categories:write");
  const id = String(fd.get("id") ?? "");
  if (!user || !Types.ObjectId.isValid(id)) return;
  await connectDb();
  const c = await Category.findById(id).lean();
  if (!c) redirect("/admin/categories");
  if (c.type === "category" && c.parent && (await Product.countDocuments({ category: c.parent, status: { $ne: "archived" } }))) redirect(`/admin/categories/${id}?blocked=products`);
  await Category.deleteOne({ _id: id });
  await audit(user, "category.delete", "category", id, `Deleted collection ${c.slug}`);
  refresh(); redirect("/admin/categories");
}

/* ------------------------------ inventory ------------------------------ */

export async function adjustStockAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor("inventory:write");
  if (!user) return { error: FORBIDDEN };
  const parsed = stockAdjustSchema.safeParse(formObj(fd));
  if (!parsed.success) return fail(issues(parsed.error), fd);
  const { productId, sku, mode, value, reason, note } = parsed.data;
  await connectDb();
  const p = await Product.findById(productId).lean();
  if (!p) return { error: "Product not found" };
  const variant = p.variants?.find((v) => v.sku === sku.toUpperCase());
  if (!variant && p.sku !== sku.toUpperCase()) return { error: "SKU not found on this product" };
  const current = variant ? variant.stock : p.stock;
  const target = mode === "set" ? value : current + value;
  if (target < 0) return fail({ value: `Stock can't go below 0 (current ${current})` }, fd);
  const delta = target - current;
  if (delta === 0) return fail({ value: "No change" }, fd);
  // Conditional on the stock we read, so a concurrent order can't be overwritten silently.
  const res = variant
    ? await Product.updateOne({ _id: productId, variants: { $elemMatch: { sku: variant.sku, stock: current } } }, { $inc: { "variants.$.stock": delta, stock: delta } })
    : await Product.updateOne({ _id: productId, stock: current }, { $inc: { stock: delta } });
  if (!res.modifiedCount) return { error: "Stock changed while you were editing — reload and try again." };
  await InventoryMovement.create({ product: productId, sku: sku.toUpperCase(), delta, reason, actor: user.id, note });
  await audit(user, "inventory.adjust", "product", productId, `Stock ${sku.toUpperCase()} ${delta > 0 ? "+" : ""}${delta} (${reason})`, { from: current, to: target });
  refresh(); revalidatePath("/admin/inventory");
  return { ok: true };
}
