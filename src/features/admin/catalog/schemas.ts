import { z } from "zod";
import { checkbox, int, json, money, objectId, optText, text } from "@/lib/admin/common";
import { isAllowedImageUrl } from "@/lib/image-url";
import { slugify } from "../../../../lib/utils";

const imageUrl = z.string().trim().refine(isAllowedImageUrl, "Image must be an uploaded file or an https URL on an allowed host (IMAGE_HOSTS)");
const catSlug = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "Category: lowercase letters, numbers and dashes, e.g. bags");

// Fields follow the shared flat product schema (lib/models/Product.ts): name, priceFrom (original) / priceTo (selling), colour + size variants.
export const productSchema = z.object({
  id: z.string().optional(),
  slug: z.string().trim().optional().transform((v) => (v ? slugify(v) : "")),
  sku: z.string().trim().min(2, "SKU is required").max(40, "SKU too long").regex(/^[A-Za-z0-9._-]+$/, "SKU may only contain letters, numbers . _ -"),
  name: text(200).min(2, "Name is required"),
  shortDescription: text(400).min(1, "Short description is required"),
  longDescription: text(5000),
  category: catSlug,
  subcategory: text(40).transform((v) => v || "general"),
  brand: optText(60), model: optText(120), finish: optText(60),
  priceFrom: money("Original price"),
  priceTo: money("Selling price"),
  // Disabled in the form (not submitted) when the product has variants: stock is then the sum of variant stock.
  stock: z.preprocess((v) => (v === undefined || v === "" ? 0 : v), int("Stock", 1_000_000)),
  lowStockThreshold: int("Low-stock threshold", 100_000),
  status: z.enum(["active", "draft", "archived"], "Choose a status"),
  isFeatured: checkbox, isNewArrival: checkbox, isMostWanted: checkbox,
  tags: z.string().trim().max(300).optional().transform((v) => (v ? [...new Set(v.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20) : [])),
  highlights: z.string().optional().transform((v) => (v ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 20)),
  includedItems: z.string().optional().transform((v) => (v ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 20)),
  images: json(z.array(z.object({ url: imageUrl, alt: z.object({ en: text(200), ar: text(200) }).optional() })).max(12, "At most 12 images"), []),
  variants: json(z.array(z.object({
    sku: z.string().trim().min(2, "Variant SKU required").max(50).regex(/^[A-Za-z0-9._-]+$/, "Variant SKU: letters, numbers . _ -"),
    color: optText(40), size: optText(20), stock: int("Variant stock"),
    price: z.preprocess((v) => (v === "" || v == null ? undefined : v), money("Variant price").optional()),
    image: z.string().trim().optional().transform((v) => v || undefined),
  })).max(100, "At most 100 variants"), []),
  seoTitle: text(70), seoDesc: text(160),
}).superRefine((p, ctx) => {
  if (p.priceTo > p.priceFrom) ctx.addIssue({ code: "custom", path: ["priceTo"], message: "Selling price can't be higher than the original price" });
  const skus = p.variants.map((v) => v.sku.toUpperCase());
  if (new Set(skus).size !== skus.length) ctx.addIssue({ code: "custom", path: ["variants"], message: "Variant SKUs must be unique" });
  if (skus.includes(p.sku.toUpperCase())) ctx.addIssue({ code: "custom", path: ["variants"], message: "A variant SKU can't equal the product SKU" });
  const combos = p.variants.map((v) => `${(v.color ?? "").toLowerCase()}|${(v.size ?? "").toLowerCase()}`);
  if (new Set(combos).size !== combos.length) ctx.addIssue({ code: "custom", path: ["variants"], message: "Two variants have the same colour and size" });
});
export type ProductInput = z.infer<typeof productSchema>;

// A "category" is a Collection document of type "category" (its `parent` is the category slug products store).
export const categorySchema = z.object({
  id: z.string().optional(),
  slug: z.string().trim().optional().transform((v) => (v ? slugify(v) : "")),
  name: text(100).min(2, "Name is required"),
  description: text(500),
  image: z.string().trim().optional().refine((v) => !v || isAllowedImageUrl(v), "Image must be an uploaded file or an allowed https URL"),
  type: z.enum(["category", "style", "finish", "curated"]),
  parent: z.string().trim().toLowerCase().optional().transform((v) => v || undefined),
  sortOrder: int("Order", 10_000).default(0),
  seoTitle: text(70), seoDesc: text(160),
}).superRefine((c, ctx) => {
  if (c.type === "category" && !c.parent) ctx.addIssue({ code: "custom", path: ["parent"], message: "A category collection needs the category slug (e.g. watches)" });
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const brandSchema = z.object({
  id: z.string().optional(),
  slug: z.string().trim().optional().transform((v) => (v ? slugify(v) : "")),
  name: text(60).min(2, "Name is required"),
  description: text(1000),
  logo: z.string().trim().max(500).optional().transform((v) => v || ""),
  image: z.string().trim().max(500).optional().transform((v) => v || ""),
  isFeatured: checkbox,
  isActive: checkbox,
  sortOrder: int("Order", 10_000).default(0),
});

export const stockAdjustSchema = z.object({
  productId: objectId,
  sku: z.string().trim().min(1),
  mode: z.enum(["delta", "set"]),
  value: z.coerce.number({ error: "Enter a number" }).int("Whole numbers only").min(-1_000_000).max(1_000_000),
  reason: z.enum(["restock", "manual_adjustment", "correction"], "Choose a reason"),
  note: z.string().trim().max(200).optional(),
});
