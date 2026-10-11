import { effectivePrice } from "@/models/product";
import { isAllowedImageUrl } from "@/lib/image-url";

// Pure validation for product CSV rows (no DB access) — easy to test. Context comes from the caller.
export const PRODUCT_COLUMNS: Record<string, string[]> = {
  sku: ["product_sku"], slug: ["url_slug"], name_en: ["name", "title", "name_english"], name_ar: ["name_arabic"],
  description_en: ["description", "description_english"], description_ar: ["description_arabic"],
  category_slug: ["category"], brand: [], price: [], sale_price: ["sale", "special_price"], stock: ["quantity", "qty"],
  low_stock_threshold: ["low_stock"], status: [], featured: [], tags: [], image_urls: ["images", "image_url"], attributes: ["attrs"],
};
export const PRODUCT_TEMPLATE_HEADERS = ["sku", "slug", "name_en", "name_ar", "description_en", "description_ar", "category_slug", "brand", "price", "sale_price", "stock", "low_stock_threshold", "status", "featured", "tags", "image_urls", "attributes"];

export type ExistingProduct = { id: string; sku: string; slug: string; price: number; salePrice?: number | null; saleStartsAt?: Date | null; saleEndsAt?: Date | null; stock: number; hasVariants: boolean; categoryId: string };
export type ProductCtx = {
  categories: Map<string, { id: string; attrKeys: string[] }>; // by slug
  bySku: Map<string, ExistingProduct>; slugOwner: Map<string, string>; // slug → sku
  present: Set<string>; // columns present in the file
};
export type RowIssue = { line: number; sku: string; action: "create" | "update" | "error"; errors: string[]; doc?: Record<string, unknown>; stockDelta?: number };

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

    if (!existing) for (const req of ["name_en", "name_ar", "category_slug", "price"]) if (!has(req)) errors.push(`${req} is required to create a new product`);
    if (has("name_en")) { if (r.name_en.length > 200) errors.push("name_en too long (max 200)"); doc["name.en"] = r.name_en; }
    if (has("name_ar")) { if (r.name_ar.length > 200) errors.push("name_ar too long (max 200)"); doc["name.ar"] = r.name_ar; }
    if (has("description_en")) { if (r.description_en.length > 5000) errors.push("description_en too long"); doc["description.en"] = r.description_en; }
    if (has("description_ar")) { if (r.description_ar.length > 5000) errors.push("description_ar too long"); doc["description.ar"] = r.description_ar; }
    if (has("brand")) { if (r.brand.length > 60) errors.push("brand too long (max 60)"); doc.brand = r.brand; }

    let catAttrKeys: string[] = [];
    const cat = has("category_slug") ? ctx.categories.get(r.category_slug.toLowerCase()) : undefined;
    if (has("category_slug")) { if (!cat) errors.push(`unknown category_slug "${r.category_slug}"`); else { doc.category = cat.id; catAttrKeys = cat.attrKeys; } }
    else if (existing) catAttrKeys = [...ctx.categories.values()].find((c) => c.id === existing.categoryId)?.attrKeys ?? [];

    const slug = has("slug") ? r.slug.toLowerCase() : !existing && has("name_en") ? slugify(r.name_en) : undefined;
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
    if (has("sale_price")) { const n = num(r.sale_price); if (Number.isNaN(n) || n < 0) errors.push(`sale_price must be a non-negative number (got "${r.sale_price}")`); else { sale = Math.round(n * 100) / 100; doc.salePrice = sale; } }
    if (sale != null && price != null && has("sale_price") && sale >= price) errors.push("sale_price must be lower than price");
    if (price != null && (has("price") || has("sale_price"))) doc.finalPrice = effectivePrice({ price, salePrice: sale, saleStartsAt: existing?.saleStartsAt, saleEndsAt: existing?.saleEndsAt });

    if (has("stock")) {
      const n = num(r.stock);
      if (!Number.isInteger(n) || n < 0 || n > 1_000_000) errors.push(`stock must be a whole number ≥ 0 (got "${r.stock}")`);
      else if (existing?.hasVariants) errors.push("this product has variants; stock is managed per variant in the admin");
      else { doc.stock = n; stockDelta = n - (existing?.stock ?? 0); }
    }
    if (has("low_stock_threshold")) { const n = num(r.low_stock_threshold); if (!Number.isInteger(n) || n < 0) errors.push("low_stock_threshold must be a whole number ≥ 0"); else doc.lowStockThreshold = n; }
    if (has("status")) { const s = r.status.toLowerCase(); if (!["draft", "published", "archived"].includes(s)) errors.push(`status must be draft, published or archived (got "${r.status}")`); else doc.status = s; }
    else if (!existing) doc.status = "draft"; // new products are never published by accident
    if (has("featured")) { const b = bool(r.featured); if (b === null) errors.push(`featured must be true/false (got "${r.featured}")`); else doc.featured = b; }
    if (has("tags")) doc.tags = [...new Set(r.tags.split("|").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
    if (has("image_urls")) {
      const urls = r.image_urls.split("|").map((u) => u.trim()).filter(Boolean);
      const bad = urls.filter((u) => !isAllowedImageUrl(u));
      if (urls.length > 10) errors.push("at most 10 image_urls");
      else if (bad.length) errors.push(`image URL not allowed (must be https on an allowed host or an uploaded file): ${bad[0]}`);
      else doc.images = urls.map((url) => ({ url, alt: { en: "", ar: "" } }));
    }
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
