import { z } from "zod";
import { checkbox, int, json, money, objectId, optDate, optMoney, optText, slug, text } from "@/lib/admin/common";
import { isAllowedImageUrl } from "@/lib/image-url";

const l10n = z.object({ en: text(200), ar: text(200) });
const l10nReq = z.object({ en: text(200).min(1, "English text is required"), ar: text(200).min(1, "Arabic text is required") });
const imageUrl = z.string().trim().refine(isAllowedImageUrl, "Image must be an uploaded file or an https URL on an allowed host (IMAGE_HOSTS)");

export const productSchema = z.object({
  id: z.string().optional(),
  slug,
  sku: z.string().trim().min(2, "SKU is required").max(40, "SKU too long").regex(/^[A-Za-z0-9._-]+$/, "SKU may only contain letters, numbers . _ -"),
  name_en: text(200).min(2, "English name is required"),
  name_ar: text(200).min(2, "Arabic name is required"),
  description_en: text(5000), description_ar: text(5000),
  category: objectId,
  brand: optText(60),
  price: money("Price"),
  salePrice: optMoney("Sale price"),
  saleStartsAt: optDate, saleEndsAt: optDate,
  // Disabled in the form (not submitted) when the product has variants: stock is then the sum of variant stock.
  stock: z.preprocess((v) => (v === undefined || v === "" ? 0 : v), int("Stock", 1_000_000)),
  lowStockThreshold: int("Low-stock threshold", 100_000),
  status: z.enum(["draft", "published", "archived"], "Choose a status"),
  featured: checkbox,
  tags: z.string().trim().max(300).optional().transform((v) => (v ? [...new Set(v.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20) : [])),
  icon: z.string().trim().max(8).optional().transform((v) => v || "📦"),
  hue: z.coerce.number().int().min(0).max(360).default(160),
  images: json(z.array(z.object({ url: imageUrl, alt: l10n })).max(10, "At most 10 images"), []),
  variants: json(z.array(z.object({ sku: z.string().trim().min(2, "Variant SKU required").max(50).regex(/^[A-Za-z0-9._-]+$/, "Variant SKU: letters, numbers . _ -"), label: l10nReq, stock: int("Variant stock"), price: z.preprocess((v) => (v === "" || v == null ? undefined : v), money("Variant price").optional()) })).max(30, "At most 30 variants"), []),
  specs: json(z.array(z.object({ label: l10nReq, value: l10nReq })).max(30, "At most 30 specifications"), []),
  attrs: json(z.record(z.string().max(30), z.string().trim().max(60)), {}),
  seoTitle_en: text(70), seoTitle_ar: text(70), seoDesc_en: text(160), seoDesc_ar: text(160),
}).superRefine((p, ctx) => {
  if (p.salePrice != null && p.salePrice >= p.price) ctx.addIssue({ code: "custom", path: ["salePrice"], message: "Sale price must be lower than the price" });
  if (p.saleStartsAt && p.saleEndsAt && p.saleEndsAt < p.saleStartsAt) ctx.addIssue({ code: "custom", path: ["saleEndsAt"], message: "Sale end must be after its start" });
  const skus = p.variants.map((v) => v.sku.toUpperCase());
  if (new Set(skus).size !== skus.length) ctx.addIssue({ code: "custom", path: ["variants"], message: "Variant SKUs must be unique" });
  if (skus.includes(p.sku.toUpperCase())) ctx.addIssue({ code: "custom", path: ["variants"], message: "A variant SKU can't equal the product SKU" });
  p.variants.forEach((v, i) => { if (v.price != null && v.price > p.price) ctx.addIssue({ code: "custom", path: ["variants", i], message: "Variant price can't exceed the list price" }); });
});
export type ProductInput = z.infer<typeof productSchema>;

export const categorySchema = z.object({
  id: z.string().optional(),
  slug,
  name_en: text(100).min(2, "English name is required"), name_ar: text(100).min(2, "Arabic name is required"),
  desc_en: text(500), desc_ar: text(500),
  parent: z.string().optional().transform((v) => (v && /^[a-f0-9]{24}$/i.test(v) ? v : null)),
  icon: z.string().trim().max(8).optional().transform((v) => v || "🛍️"),
  hue: z.coerce.number().int().min(0).max(360).default(160),
  image: z.string().trim().optional().refine((v) => !v || isAllowedImageUrl(v), "Image must be an uploaded file or an allowed https URL"),
  order: int("Order", 10_000).default(0),
  active: checkbox,
  attributes: json(z.array(z.object({ key: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{1,30}$/, "Attribute key: a-z 0-9 _ -"), label: l10nReq })).max(12, "At most 12 attributes"), []),
  seoTitle_en: text(70), seoTitle_ar: text(70), seoDesc_en: text(160), seoDesc_ar: text(160),
}).superRefine((c, ctx) => {
  const keys = c.attributes.map((a) => a.key);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", path: ["attributes"], message: "Attribute keys must be unique" });
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const stockAdjustSchema = z.object({
  productId: objectId,
  sku: z.string().trim().min(1),
  mode: z.enum(["delta", "set"]),
  value: z.coerce.number({ error: "Enter a number" }).int("Whole numbers only").min(-1_000_000).max(1_000_000),
  reason: z.enum(["restock", "manual_adjustment", "correction"], "Choose a reason"),
  note: z.string().trim().max(200).optional(),
});
