import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const i18n = { en: { type: String, required: true, trim: true }, ar: { type: String, required: true, trim: true } };

const productSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    slugHistory: [{ type: String, lowercase: true }], // old slugs → 301 redirect to the current one
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: i18n,
    description: { en: { type: String, default: "" }, ar: { type: String, default: "" } },
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    brand: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    salePrice: { type: Number, min: 0 },
    saleStartsAt: Date, // optional schedule: the sale price only applies inside this window
    saleEndsAt: Date,
    // Effective price (salePrice if valid, else price). Indexed for filter/sort; kept in sync on save.
    finalPrice: { type: Number, required: true, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    variants: [{ _id: false, sku: { type: String, required: true, uppercase: true }, label: i18n, stock: { type: Number, default: 0, min: 0 }, price: { type: Number, min: 0 }, image: String, swatch: String }],
    attrs: { type: Map, of: String, default: {} },
    specs: [{ _id: false, label: i18n, value: i18n }],
    tags: [String],
    images: [{ _id: false, url: String, alt: { en: String, ar: String } }],
    // Placeholder visuals used until real images are uploaded.
    icon: { type: String, default: "📦" },
    hue: { type: Number, default: 160 },
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    viewCount: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },
    featured: { type: Boolean, default: false },
    status: { type: String, enum: ["draft", "published", "archived"], default: "draft" },
    seo: { title: { en: String, ar: String }, description: { en: String, ar: String } },
  },
  { timestamps: true },
);

/** The price customers pay now: the sale price if it is lower and (when scheduled) currently in its window. */
export function effectivePrice(p: { price: number; salePrice?: number | null; saleStartsAt?: Date | null; saleEndsAt?: Date | null }, now = new Date()) {
  const { price, salePrice: sale } = p;
  const active = sale != null && sale < price && (!p.saleStartsAt || p.saleStartsAt <= now) && (!p.saleEndsAt || p.saleEndsAt >= now);
  return active ? sale : price;
}

productSchema.pre("validate", function () {
  this.finalPrice = effectivePrice(this);
});

// default_language "none": no English stemming, so Arabic tokens match by whitespace.
productSchema.index(
  { "name.en": "text", "name.ar": "text", "description.en": "text", "description.ar": "text", brand: "text", tags: "text" },
  { weights: { "name.en": 10, "name.ar": 10, brand: 5, tags: 3 }, default_language: "none", name: "product_text" },
);
productSchema.index({ status: 1, category: 1, finalPrice: 1 });
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ status: 1, viewCount: -1 });
productSchema.index({ status: 1, soldCount: -1 });
productSchema.index({ status: 1, featured: 1 });
productSchema.index({ status: 1, brand: 1 });
productSchema.index({ slugHistory: 1 });
productSchema.index({ "variants.sku": 1 });

export type ProductDoc = InferSchemaType<typeof productSchema>;
export const Product: Model<ProductDoc> = (models.Product as Model<ProductDoc>) ?? model("Product", productSchema);
