import { effectivePrice } from "@/models/product";
import { isAllowedImageUrl, isBlockedImage } from "@/lib/image-url";

// Pure validation for product CSV rows (no DB access) — easy to test. Context comes from the caller.
export const PRODUCT_COLUMNS: Record<string, string[]> = {
  sku: ["product_sku"], slug: ["url_slug"], name_en: ["name", "title", "name_english"], name_ar: ["name_arabic"],
  description_en: ["description", "description_english"], description_ar: ["description_arabic"],
  category_slug: ["category"], brand: [], price: [], old_price: ["compare_at_price", "original_price"], sale_price: ["sale", "special_price"], stock: ["quantity", "qty", "stock_quantity"], color: ["colour"], size: [], stock_status: ["availability"], variants: [], group: [],
  low_stock_threshold: ["low_stock"], status: [], featured: [], tags: [], image_urls: ["images", "image_url"], attributes: ["attrs"],
};
export const PRODUCT_TEMPLATE_HEADERS = ["sku", "slug", "name_en", "name_ar", "description_en", "description_ar", "category_slug", "brand", "price", "sale_price", "stock", "stock_status", "low_stock_threshold", "status", "featured", "tags", "image_urls", "attributes", "variants"];

export type ExistingProduct = { id: string; sku: string; slug: string; price: number; salePrice?: number | null; saleStartsAt?: Date | null; saleEndsAt?: Date | null; stock: number; hasVariants: boolean; categoryId: string };
export type ProductCtx = {
  categories: Map<string, { id: string; attrKeys: string[] }>; // by slug
  bySku: Map<string, ExistingProduct>; slugOwner: Map<string, string>; // slug → sku
  present: Set<string>; // columns present in the file
  createCategories?: boolean; // unknown category names are created (top-level) on import instead of rejected
};
export type RowIssue = { line: number; sku: string; action: "create" | "update" | "error"; errors: string[]; doc?: Record<string, unknown>; stockDelta?: number };

/** New/zero-stock products flagged "In Stock" without a quantity get this many units (set the real number later in admin / by adding a stock column). */
export const DEFAULT_IN_STOCK_QTY = 20;
const stockFlag = (s: string): boolean | null => (/^(in[\s_-]*stock|available|yes|true)$/i.test(s.trim()) ? true : /^(out[\s_-]*of[\s_-]*stock|sold[\s_-]*out|unavailable|no|false)$/i.test(s.trim()) ? false : null);
const num = (s: string) => (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN);
const bool = (s: string) => (/^(true|1|yes|y)$/i.test(s) ? true : /^(false|0|no|n)$/i.test(s) ? false : null);
export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);

/** Validate raw rows (already mapped to canonical column names). `firstLine` is the 1-based file line of rows[0] (header = line 1). */
export function validateProductRows(rows: Record<string, string>[], ctx: ProductCtx, firstLine = 2): RowIssue[] {
  const seenSku = new Map<string, number>(); const seenSlug = new Map<string, number>();
  return rows.map((r, idx) => {
    const line = firstLine + idx; const errors: string[] = [];
    const sku = (r.sku ?? "").toUpperCase();
    const has = (c: string) => ctx.present.has(c) && (r[c] ?? "") !== ""; // empty cell = "leave unchanged"
    if (!sku) return { line, sku: "", action: "error", errors: ["sku is required (it identifies the product)"] };
    if (!/^[A-Z0-9._-]{2,40}$/.test(sku)) errors.push("sku may only contain letters, numbers . _ - (2–40 chars)");
    if (seenSku.has(sku)) errors.push(`duplicate sku in this file (first on line ${seenSku.get(sku)})`); else seenSku.set(sku, line);
    const existing = ctx.bySku.get(sku);
    const doc: Record<string, unknown> = {};
    let stockDelta: number | undefined;

    // scraped/English-only files: a new product without name_ar reuses name_en so the Arabic site is never blank (edit later in admin)
    const arFallback = !existing && has("name_en") && !has("name_ar");
    if (!existing) for (const req of ["name_en", ...(arFallback ? [] : ["name_ar"]), "category_slug", "price"]) if (!has(req)) errors.push(`${req} is required to create a new product`);
    if (has("name_en")) { if (r.name_en.length > 200) errors.push("name_en too long (max 200)"); doc["name.en"] = r.name_en; }
    if (has("name_ar")) { if (r.name_ar.length > 200) errors.push("name_ar too long (max 200)"); doc["name.ar"] = r.name_ar; }
    else if (arFallback) doc["name.ar"] = r.name_en;
    if (has("description_en")) { if (r.description_en.length > 5000) errors.push("description_en too long"); doc["description.en"] = r.description_en; }
    if (has("description_ar")) { if (r.description_ar.length > 5000) errors.push("description_ar too long"); doc["description.ar"] = r.description_ar; }
    if (has("brand")) { if (r.brand.length > 60) errors.push("brand too long (max 60)"); doc.brand = r.brand; }

    let catAttrKeys: string[] = [];
    // accepts the slug ("all-jewelry") or the English category name ("All Jewelry")
    const cat = has("category_slug") ? ctx.categories.get(r.category_slug.toLowerCase()) ?? ctx.categories.get(slugify(r.category_slug)) : undefined;
    if (has("category_slug")) { if (cat) { doc.category = cat.id; catAttrKeys = cat.attrKeys; }
      else if (ctx.createCategories && slugify(r.category_slug)) doc.newCategory = { slug: slugify(r.category_slug), name: r.category_slug.trim().slice(0, 100) };
      else errors.push(`unknown category_slug "${r.category_slug}"`); }
    else if (existing) catAttrKeys = [...ctx.categories.values()].find((c) => c.id === existing.categoryId)?.attrKeys ?? [];

    let slug = has("slug") ? r.slug.toLowerCase() : !existing && has("name_en") ? slugify(r.name_en) : undefined;
    // generated slugs (no slug column): same-named products get the SKU appended instead of being rejected
    if (!has("slug") && slug && ((ctx.slugOwner.get(slug) ?? sku) !== sku || seenSlug.has(slug))) slug = `${slug.slice(0, 90)}-${slugify(sku)}`.slice(0, 100);
    if (slug !== undefined) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) errors.push(`invalid slug "${slug}" (lowercase letters, numbers, hyphens)`);
      else {
        const owner = ctx.slugOwner.get(slug);
        if (owner && owner !== sku) errors.push(`slug "${slug}" is already used by ${owner}`);
        if (seenSlug.has(slug)) errors.push(`duplicate slug "${slug}" in this file (line ${seenSlug.get(slug)})`); else seenSlug.set(slug, line);
        doc.slug = slug;
      }
    }

    let price = existing?.price; let sale: number | null | undefined = existing?.salePrice;
    if (has("price")) { const n = num(r.price); if (Number.isNaN(n) || n < 0 || n > 1_000_000) errors.push(`price must be a number between 0 and 1,000,000 (got "${r.price}")`); else { price = Math.round(n * 100) / 100; doc.price = price; } }
    // old_price (compare-at) > price means "price" is the discounted price: store old_price as price and price as the sale price
    if (has("old_price") && !has("sale_price")) {
      const o = num(r.old_price);
      if (Number.isNaN(o) || o < 0 || o > 1_000_000) errors.push(`old_price must be a number between 0 and 1,000,000 (got "${r.old_price}")`);
      else if (price != null && o > price) { sale = price; price = Math.round(o * 100) / 100; doc.price = price; doc.salePrice = sale; }
    }
    if (has("sale_price")) { const n = num(r.sale_price); if (Number.isNaN(n) || n < 0) errors.push(`sale_price must be a non-negative number (got "${r.sale_price}")`); else { sale = Math.round(n * 100) / 100; doc.salePrice = sale; } }
    if (sale != null && price != null && (has("sale_price") || doc.salePrice !== undefined) && sale >= price) errors.push("sale_price must be lower than price");
    if (price != null && (has("price") || has("sale_price") || has("old_price"))) doc.finalPrice = effectivePrice({ price, salePrice: sale, saleStartsAt: existing?.saleStartsAt, saleEndsAt: existing?.saleEndsAt });

    const flag = has("stock_status") ? stockFlag(r.stock_status) : null;
    if (has("stock_status") && flag === null) errors.push(`stock_status must be "In Stock" or "Out of Stock" (got "${r.stock_status}")`);

    // no stock info in the file at all (e.g. a scraper export) → treat as available rather than creating everything out of stock
    const inStockDefault = flag === true || (!ctx.present.has("stock_status") && !ctx.present.has("stock"));
    // variants: "Label~SKU~stock~price~imageUrl" separated by | (only the label is required; the rest may be left empty)
    let variantImages: string[] = [];
    if (has("variants")) {
      const vs: { sku: string; label: { en: string; ar: string }; stock: number; price?: number; image?: string }[] = [];
      for (const part of r.variants.split("|").map((x) => x.trim()).filter(Boolean)) {
        const [label = "", vsku = "", vstock = "", vprice = "", ...img] = part.split("~").map((x) => x.trim());
        const image = img.join("~");
        if (!label) { errors.push(`variant "${part}" needs a label (Label~SKU~stock~price~imageUrl)`); continue; }
        const skuV = (vsku || `${sku}-${slugify(label)}`).toUpperCase();
        if (!/^[A-Z0-9._-]{2,50}$/.test(skuV)) { errors.push(`variant SKU "${skuV}" may only contain letters, numbers . _ -`); continue; }
        let stockV = inStockDefault ? DEFAULT_IN_STOCK_QTY : 0;
        if (vstock !== "") { const n = num(vstock); if (!Number.isInteger(n) || n < 0 || n > 1_000_000) { errors.push(`variant "${label}": stock must be a whole number ≥ 0`); continue; } stockV = n; }
        const v: (typeof vs)[number] = { sku: skuV, label: { en: label, ar: label }, stock: stockV };
        if (vprice !== "") { const n = num(vprice); if (Number.isNaN(n) || n < 0) { errors.push(`variant "${label}": price must be a number`); continue; } v.price = Math.round(n * 100) / 100; }
        if (image && !isBlockedImage(image)) { if (!isAllowedImageUrl(image)) { errors.push(`variant "${label}": image URL not allowed (https on an allowed host): ${image}`); continue; } v.image = image; }
        vs.push(v);
      }
      if (vs.length > 30) errors.push("at most 30 variants");
      if (new Set(vs.map((v) => v.sku)).size !== vs.length) errors.push("variant SKUs must be unique (give each option its own SKU or a different label)");
      if (vs.some((v) => v.sku === sku)) errors.push("a variant SKU can't equal the product SKU");
      if (price != null && vs.some((v) => v.price != null && v.price > price!)) errors.push("a variant price can't exceed the product price");
      doc.variants = vs;
      variantImages = vs.flatMap((v) => (v.image ? [v.image] : []));
      if (vs.length) { doc.stock = vs.reduce((a, v) => a + v.stock, 0); stockDelta = (doc.stock as number) - (existing?.stock ?? 0); }
    } else if (has("stock")) {
      const n = num(r.stock);
      if (!Number.isInteger(n) || n < 0 || n > 1_000_000) errors.push(`stock must be a whole number ≥ 0 (got "${r.stock}")`);
      else if (existing?.hasVariants) errors.push("this product has variants; stock is managed per variant in the admin");
      else { doc.stock = n; stockDelta = n - (existing?.stock ?? 0); }
    } else if (!existing && inStockDefault) {
      doc.stock = DEFAULT_IN_STOCK_QTY; stockDelta = DEFAULT_IN_STOCK_QTY;
    } else if (flag !== null && !existing?.hasVariants) {
      // "In Stock" with no quantity: don't leave the product at 0 (= shown out of stock); never lower stock that is already > 0.
      const n = flag ? ((existing?.stock ?? 0) > 0 ? existing!.stock : DEFAULT_IN_STOCK_QTY) : 0;
      if (!existing || n !== existing.stock) { doc.stock = n; stockDelta = n - (existing?.stock ?? 0); }
    }
    if (has("low_stock_threshold")) { const n = num(r.low_stock_threshold); if (!Number.isInteger(n) || n < 0) errors.push("low_stock_threshold must be a whole number ≥ 0"); else doc.lowStockThreshold = n; }
    if (has("status")) { const s = r.status.toLowerCase(); if (!["draft", "published", "archived"].includes(s)) errors.push(`status must be draft, published or archived (got "${r.status}")`); else doc.status = s; }
    else if (!existing) doc.status = "draft"; // new products are never published by accident
    if (has("featured")) { const b = bool(r.featured); if (b === null) errors.push(`featured must be true/false (got "${r.featured}")`); else doc.featured = b; }
    if (has("tags")) doc.tags = [...new Set(r.tags.split("|").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
    if (has("image_urls")) {
      const urls = r.image_urls.split("|").map((u) => u.trim()).filter((u) => u && !isBlockedImage(u)); // blocked = IMAGE_BLOCKLIST (skipped silently)
      const bad = urls.filter((u) => !isAllowedImageUrl(u));
      if (urls.length > 10) errors.push("at most 10 image_urls");
      else if (bad.length) errors.push(`image URL not allowed (must be https on an allowed host or an uploaded file): ${bad[0]}`);
      else doc.images = urls.map((url) => ({ url, alt: { en: "", ar: "" } }));
    }
    else if (!existing && variantImages.length) doc.images = [...new Set(variantImages)].slice(0, 10).map((url) => ({ url, alt: { en: "", ar: "" } }));
    if (has("attributes")) {
      const attrs: Record<string, string> = {};
      for (const pair of r.attributes.split("|").map((p) => p.trim()).filter(Boolean)) {
        const i = pair.indexOf(":"); const k = pair.slice(0, i).trim().toLowerCase(); const v = pair.slice(i + 1).trim();
        if (i < 1 || !v) { errors.push(`attributes must look like key:value|key:value (got "${pair}")`); continue; }
        if (!catAttrKeys.includes(k)) { errors.push(`attribute "${k}" is not defined on this category`); continue; }
        attrs[k] = v.slice(0, 60);
      }
      doc.attrs = attrs;
    }
    if (errors.length) return { line, sku, action: "error", errors };
    return { line, sku, action: existing ? "update" : "create", errors: [], doc, stockDelta };
  });
}
