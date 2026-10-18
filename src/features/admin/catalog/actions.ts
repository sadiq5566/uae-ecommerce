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
import { categorySchema, productSchema, stockAdjustSchema } from "./schemas";
import { parseProductFilters, productFilterQuery } from "./queries";

const refresh = () => revalidatePath("/[lang]", "layout");

/* ------------------------------ products ------------------------------ */

export async function saveProductAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor("products:write");
  if (!user) return { error: FORBIDDEN };
  const parsed = productSchema.safeParse(formObj(fd));
  if (!parsed.success) return fail(issues(parsed.error), fd);
  const p = parsed.data;
  await connectDb();
  if (!(await Category.exists({ _id: p.category }))) return fail({ category: "Choose a valid category" }, fd);

  // Attribute keys must exist on the category (filters are data-driven from the category definition).
  const cat = await Category.findById(p.category).lean();
  const allowed = new Set((cat?.attributes ?? []).map((a) => a.key));
  const attrs = Object.fromEntries(Object.entries(p.attrs).filter(([k, v]) => allowed.has(k) && v));
  const hasVariants = p.variants.length > 0;
  const stock = hasVariants ? p.variants.reduce((a, v) => a + v.stock, 0) : p.stock;
  const variants = p.variants.map((v) => ({ sku: v.sku.toUpperCase(), label: v.label, stock: v.stock, price: v.price, image: v.image, swatch: v.swatch }));

  // Variant SKUs must not collide with any other product's SKU / variant SKU.
  const clash = await Product.findOne({ _id: { $ne: p.id || new Types.ObjectId() }, $or: [{ sku: { $in: [p.sku.toUpperCase(), ...variants.map((v) => v.sku)] } }, { "variants.sku": { $in: [p.sku.toUpperCase(), ...variants.map((v) => v.sku)] } }] }).select("sku").lean();
  if (clash) return fail({ sku: `SKU already used by product ${clash.sku}` }, fd);

  const base = {
    slug: p.slug, sku: p.sku.toUpperCase(), name: { en: p.name_en, ar: p.name_ar }, description: { en: p.description_en, ar: p.description_ar },
    category: p.category, brand: p.brand, price: p.price, salePrice: p.salePrice, saleStartsAt: p.saleStartsAt, saleEndsAt: p.saleEndsAt,
    stock, lowStockThreshold: p.lowStockThreshold, status: p.status, featured: p.featured, tags: p.tags, icon: p.icon, hue: p.hue,
    images: p.images, variants, specs: p.specs, attrs,
    seo: { title: { en: p.seoTitle_en, ar: p.seoTitle_ar }, description: { en: p.seoDesc_en, ar: p.seoDesc_ar } },
  };

  try {
    if (p.id) {
      if (!Types.ObjectId.isValid(p.id)) return { error: "Not found" };
      const doc = await Product.findById(p.id);
      if (!doc) return { error: "Product not found" };
      // Slug changes keep the old slug so old URLs 301-redirect.
      const clashSlug = p.slug !== doc.slug && (await Product.exists({ _id: { $ne: doc._id }, slugHistory: p.slug }));
      if (clashSlug) return fail({ slug: "That slug was used by another product before" }, fd);
      const history = new Set<string>(doc.slugHistory ?? []);
      if (doc.slug !== p.slug) history.add(doc.slug);
      history.delete(p.slug);
      const before = new Map<string, number>(doc.variants?.length ? doc.variants.map((v) => [v.sku, v.stock]) : [[doc.sku, doc.stock]]);
      doc.set({ ...base, slugHistory: [...history] });
      await doc.save();
      const after = new Map<string, number>(hasVariants ? variants.map((v) => [v.sku, v.stock]) : [[base.sku, stock]]);
      const moves = [...after].map(([sku, qty]) => ({ sku, delta: qty - (before.get(sku) ?? 0) })).filter((m) => m.delta !== 0);
      if (moves.length) await InventoryMovement.insertMany(moves.map((m) => ({ product: doc._id, sku: m.sku, delta: m.delta, reason: "manual_adjustment", actor: user.id, note: "Edited in product form" })));
      await audit(user, "product.update", "product", String(doc._id), `Updated product ${base.sku}`, { status: p.status, slugChanged: doc.slug !== p.slug });
      refresh(); revalidatePath("/admin/products");
      return { ok: true };
    }
    const doc = await Product.create(base);
    if (stock > 0) await InventoryMovement.insertMany((hasVariants ? variants : [{ sku: base.sku, stock }]).filter((v) => v.stock > 0).map((v) => ({ product: doc._id, sku: v.sku, delta: v.stock, reason: "restock", actor: user.id, note: "Initial stock" })));
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
    const status = op === "publish" ? "published" : op === "archive" ? "archived" : "draft";
    await Product.updateMany({ _id: { $in: ids } }, { status });
    await audit(user, `product.bulk_${op}`, "product", undefined, `${op} ${ids.length} product(s)${byFilter ? " (all matching filter)" : ""}`, detail);
  } else if (op === "feature" || op === "unfeature") {
    await Product.updateMany({ _id: { $in: ids } }, { featured: op === "feature" });
    await audit(user, `product.bulk_${op}`, "product", undefined, `${op} ${ids.length} product(s)${byFilter ? " (all matching filter)" : ""}`, detail);
  } else {
    // Only non-published products can be deleted; published ones must be unpublished/archived first (safety).
    const res = await Product.deleteMany({ _id: { $in: ids }, status: { $ne: "published" } });
    await audit(user, "product.bulk_delete", "product", undefined, `Deleted ${res.deletedCount} of ${ids.length} selected product(s)${byFilter ? " (all matching filter)" : ""}`, detail);
  }
  refresh(); revalidatePath("/admin/products");
}

export async function deleteProductAction(fd: FormData) {
  const user = await actor("products:write");
  const id = String(fd.get("id") ?? "");
  if (!user || !Types.ObjectId.isValid(id)) return;
  await connectDb();
  const res = await Product.findOneAndDelete({ _id: id, status: { $ne: "published" } }); // orders keep their own snapshot
  if (res) await audit(user, "product.delete", "product", id, `Deleted product ${res.sku}`);
  refresh(); redirect("/admin/products");
}

/* ----------------------------- categories ----------------------------- */

async function descendants(id: string): Promise<string[]> {
  const all = await Category.find({}, { parent: 1 }).lean();
  const out: string[] = []; const stack = [id];
  while (stack.length) { const cur = stack.pop()!; for (const c of all) if (String(c.parent) === cur && !out.includes(String(c._id))) { out.push(String(c._id)); stack.push(String(c._id)); } }
  return out;
}

export async function saveCategoryAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor("categories:write");
  if (!user) return { error: FORBIDDEN };
  const parsed = categorySchema.safeParse(formObj(fd));
  if (!parsed.success) return fail(issues(parsed.error), fd);
  const c = parsed.data;
  await connectDb();
  if (c.parent) {
    if (!(await Category.exists({ _id: c.parent }))) return fail({ parent: "Parent category not found" }, fd);
    if (c.id && (c.parent === c.id || (await descendants(c.id)).includes(c.parent))) return fail({ parent: "A category can't be placed under itself or one of its own subcategories" }, fd);
  }
  const base = {
    slug: c.slug, name: { en: c.name_en, ar: c.name_ar }, description: { en: c.desc_en, ar: c.desc_ar }, parent: c.parent, icon: c.icon, hue: c.hue,
    image: c.image || undefined, order: c.order, active: c.active, attributes: c.attributes,
    seo: { title: { en: c.seoTitle_en, ar: c.seoTitle_ar }, description: { en: c.seoDesc_en, ar: c.seoDesc_ar } },
  };
  try {
    if (c.id) {
      if (!Types.ObjectId.isValid(c.id)) return { error: "Not found" };
      const doc = await Category.findById(c.id);
      if (!doc) return { error: "Category not found" };
      if (c.slug !== doc.slug && (await Category.exists({ _id: { $ne: doc._id }, slugHistory: c.slug }))) return fail({ slug: "That slug was used by another category before" }, fd);
      const history = new Set<string>(doc.slugHistory ?? []);
      if (doc.slug !== c.slug) history.add(doc.slug);
      history.delete(c.slug);
      doc.set({ ...base, slugHistory: [...history] });
      await doc.save();
      await audit(user, "category.update", "category", c.id, `Updated category ${c.slug}`);
      refresh(); revalidatePath("/admin/categories");
      return { ok: true };
    }
    const doc = await Category.create(base);
    await audit(user, "category.create", "category", String(doc._id), `Created category ${c.slug}`);
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
  const [kids, products] = await Promise.all([Category.countDocuments({ parent: id }), Product.countDocuments({ category: id, status: { $ne: "archived" } })]);
  if (kids || products) redirect(`/admin/categories/${id}?blocked=${kids ? "children" : "products"}`);
  const gone = await Category.findByIdAndDelete(id);
  if (gone) await audit(user, "category.delete", "category", id, `Deleted category ${gone.slug}`);
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
