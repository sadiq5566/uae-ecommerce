import mongoose, { Schema, models, model } from "mongoose";

const ProductSchema = new Schema(
  {
    sku: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    category: { type: String, required: true, lowercase: true, trim: true, index: true },
    subcategory: String,
    brand: String,
    model: String,
    shortDescription: String,
    longDescription: String,
    highlights: [String],
    finish: String,
    includedItems: [String],
    images: [{ url: String, alt: String, publicId: String }],
    priceFrom: Number,
    priceTo: Number,
    currency: { type: String, default: "AED" },
    variants: [{ sku: String, color: String, size: String, price: Number, stock: Number, image: String }],
    stock: { type: Number, default: 0 },
    tags: [String],
    isNewArrival: Boolean,
    isFeatured: Boolean,
    isMostWanted: Boolean,
    status: { type: String, enum: ["active", "draft", "archived"], default: "active" },
    slugHistory: [String], // old slugs, redirected with 301
    // Set on a product whose colours / sizes now live as variants of another product (a supplier sheet lists one row per size). Holds that product's SKU.
    // It is independent of `status`, so a bulk "Set active" or an import can never bring the old one-size product back onto the shop.
    mergedInto: { type: String, index: true },
    lowStockThreshold: { type: Number, default: 5 },
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },
    seo: { title: String, description: String },
  },
  { timestamps: true },
);
ProductSchema.index({ category: 1, subcategory: 1 });
ProductSchema.index({ status: 1, createdAt: -1 });
// Storefront queries (lib/products.ts): collection pages, tag collections, home rows, related products.
ProductSchema.index({ status: 1, category: 1, isFeatured: -1, createdAt: -1 });
ProductSchema.index({ status: 1, tags: 1, createdAt: -1 });
ProductSchema.index({ status: 1, subcategory: 1, createdAt: -1 });
ProductSchema.index({ status: 1, isFeatured: 1, createdAt: -1 });
ProductSchema.index({ status: 1, isMostWanted: 1, createdAt: -1 });
ProductSchema.index({ status: 1, isNewArrival: 1, createdAt: -1 });
ProductSchema.index({ status: 1, soldCount: -1 });
ProductSchema.index({ slugHistory: 1 });
ProductSchema.index({ "variants.sku": 1 });
ProductSchema.index({ name: "text", model: "text", tags: "text" });

export const ProductModel = (models.Product as mongoose.Model<unknown>) || model("Product", ProductSchema);
