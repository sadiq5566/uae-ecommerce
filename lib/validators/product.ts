import { z } from "zod";
import { slugify } from "../utils";

const url = z.string().trim().refine((u) => /^(https:\/\/|\/)/.test(u), "Image URL must start with https:// or /");
const list = z.array(z.string().trim().min(1)).default([]);

export const variantSchema = z.object({
  sku: z.string().trim().min(1, "Variant SKU is required"),
  color: z.string().trim().optional(),
  size: z.string().trim().optional(),
  price: z.number().min(0).optional(),
  stock: z.number().int().min(0),
  image: z.string().trim().optional(),
});

export const productSchema = z
  .object({
    sku: z.string().trim().min(1, "SKU is required").max(40),
    name: z.string().trim().min(2, "Name is required").max(200),
    slug: z.string().trim().optional(),
    category: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "Category: lowercase letters, numbers and dashes, e.g. bags"),
    subcategory: z.string().trim().min(1, "Subcategory is required").max(40),
    brand: z.string().trim().default("Carts Heaven"),
    model: z.string().trim().optional(),
    shortDescription: z.string().trim().min(1, "Short description is required").max(400),
    longDescription: z.string().trim().max(5000).default(""),
    highlights: list,
    finish: z.string().trim().default(""),
    includedItems: list,
    images: z.array(z.object({ url, alt: z.string().trim().default(""), publicId: z.string().optional() })).min(1, "Add at least one image"),
    priceFrom: z.number().min(0),
    priceTo: z.number().min(0),
    variants: z.array(variantSchema).default([]),
    stock: z.number().int().min(0).default(0),
    tags: list,
    isNewArrival: z.boolean().default(false),
    isFeatured: z.boolean().default(false),
    isMostWanted: z.boolean().default(false),
    status: z.enum(["active", "draft", "archived"]).default("active"),
    seo: z.object({ title: z.string().trim().optional(), description: z.string().trim().optional() }).default({}),
  })
  .refine((p) => p.priceTo <= p.priceFrom, { path: ["priceTo"], message: "Selling price cannot be higher than the original price" })
  .transform((p) => ({
    ...p,
    slug: slugify(p.slug || p.name) || slugify(p.sku),
    model: p.model || p.name,
    currency: "AED" as const,
    stock: p.variants.length ? p.variants.reduce((s, v) => s + v.stock, 0) : p.stock,
    images: p.images.map((i) => ({ ...i, alt: i.alt || p.name })),
    tags: p.tags.map((t) => t.toLowerCase()),
  }));

export type ProductInput = z.output<typeof productSchema>;

export const collectionSchema = z.object({
  slug: z.string().trim().optional(),
  name: z.string().trim().min(2, "Name is required"),
  description: z.string().trim().default(""),
  image: z.string().trim().default(""),
  parent: z.string().trim().toLowerCase().optional().or(z.literal("").transform(() => undefined)),
  type: z.enum(["category", "style", "finish", "curated"]),
  sortOrder: z.number().int().default(0),
});

export const settingsSchema = z.object({
  discountPercent: z.number().min(0).max(90),
  shippingFee: z.number().min(0),
  freeShippingThreshold: z.number().min(0),
  whatsappNumber: z.string().trim().regex(/^\d{8,15}$/, "WhatsApp number: digits only with country code, e.g. 971501234567"),
  announcements: z.array(z.string().trim().min(1)).min(1, "Add at least one announcement"),
  trust: z.array(z.string().trim().min(1)).min(1, "Add at least one trust item"),
});

export const faqSchema = z.object({
  question: z.string().trim().min(3, "Question is required").max(200),
  answer: z.string().trim().min(3, "Answer is required").max(1500),
  order: z.number().int().default(0),
});
