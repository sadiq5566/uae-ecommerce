import mongoose, { Schema, models, model } from "mongoose";

const VariantSchema = new Schema(
  { sku: String, options: { type: Map, of: String }, price: Number, compareAtPrice: Number, stock: Number },
  { _id: false }
);

const ProductSchema = new Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    sku: { type: String, uppercase: true, trim: true, unique: true, sparse: true }, // optional product-level SKU; CSV import upsert key
    description: String, // HTML
    bullets: [String],
    titleAr: String,
    descriptionAr: String,
    bulletsAr: [String],
    images: [String],
    palette: { type: [String], default: ["#e9d8c4", "#b8893b"] }, // used for generated artwork when no photo
    category: { type: String, index: true }, // bags | perfumes | jewelry | pouches | watch
    brand: { type: String, index: true },
    tags: { type: [String], index: true },
    price: { type: Number, required: true },
    compareAtPrice: Number,
    options: [{ _id: false, name: String, values: [String] }],
    variants: [VariantSchema],
    stock: { type: Number, default: 10 },
    salesCount: { type: Number, default: 0 },
    ratingAvg: { type: Number, default: 4.8 },
    ratingCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isFeatured: Boolean,
  },
  { timestamps: true }
);
ProductSchema.index({ title: "text", brand: "text", tags: "text" });

const CollectionSchema = new Schema({
  title: String,
  titleAr: String,
  handle: { type: String, unique: true },
  description: String,
  descriptionAr: String,
  type: { type: String, enum: ["manual", "smart"], default: "smart" },
  rules: [{ _id: false, field: String, op: String, value: Schema.Types.Mixed }],
  sort: { type: String, default: "best-selling" },
  startsAt: Date,
  endsAt: Date,
  isActive: { type: Boolean, default: true },
  group: String, // menu grouping: bags | perfumes | jewelry | promo
});

const PromotionSchema = new Schema({
  name: String,
  nameAr: String,
  type: { type: String, enum: ["cart_percent", "cart_fixed", "free_shipping"] },
  value: Number,
  minSubtotal: Number,
  code: { type: String, uppercase: true, sparse: true, unique: true },
  firstOrderOnly: Boolean,
  usageLimit: Number,
  usedCount: { type: Number, default: 0 },
  startsAt: Date,
  endsAt: Date,
  isActive: { type: Boolean, default: true },
  stackable: { type: Boolean, default: false },
});

const OrderSchema = new Schema(
  {
    orderNumber: { type: String, unique: true, index: true },
    customer: { name: String, phone: { type: String, index: true }, email: String, emirate: String, city: String, address: String },
    items: [{ _id: false, productId: Schema.Types.ObjectId, slug: String, variantSku: String, title: String, titleAr: String, variantLabel: String, price: Number, qty: Number }],
    subtotal: Number,
    discounts: [{ _id: false, promotionId: Schema.Types.ObjectId, name: String, code: String, amount: Number }],
    shipping: { type: Number, default: 0 },
    vat: Number,
    total: Number,
    paymentMethod: { type: String, enum: ["COD", "CARD", "TABBY"], default: "COD" },
    paymentStatus: { type: String, enum: ["pending", "paid", "refunded", "failed"], default: "pending" },
    status: {
      type: String,
      enum: ["pending_payment", "pending_confirmation", "confirmed", "processing", "shipped", "delivered", "cancelled", "returned", "refund_pending", "refunded"],
      default: "pending_confirmation",
    },
    payment: { provider: String, providerRef: { type: String, index: true, sparse: true }, paidAt: Date },
    payToken: String, // secret for guests to open the card pay page
    expiresAt: Date, // unpaid card orders are cancelled after this
    trackingNumber: String,
    courier: String,
    timeline: [{ _id: false, status: String, at: Date, note: String }],
    source: { type: String, enum: ["cart", "order_now"], default: "cart" },
    locale: { type: String, enum: ["en", "ar"], default: "en" },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

const WebhookEventSchema = new Schema({ provider: String, eventId: String, createdAt: { type: Date, default: Date.now } });
WebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

const SubscriberSchema = new Schema({ email: { type: String, unique: true }, createdAt: { type: Date, default: Date.now } });

const ReviewSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, index: true },
  slug: { type: String, index: true },
  productTitle: String,
  name: String,
  city: String,
  rating: { type: Number, min: 1, max: 5 },
  title: String,
  text: String,
  verified: { type: Boolean, default: false }, // phone matched a delivered order containing this product
  approved: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now },
});

const SettingsSchema = new Schema({ key: { type: String, unique: true }, announcements: [String], announcementsAr: [String] });

const ImageSchema = new Schema({ data: Buffer, contentType: String, size: Number, createdAt: { type: Date, default: Date.now } });
export const ImageDoc = models.ImageDoc || model("ImageDoc", ImageSchema);
export const Settings = models.Settings || model("Settings", SettingsSchema);
export const Review = models.Review || model("Review", ReviewSchema);
export const Product = models.Product || model("Product", ProductSchema);
export const Collection = models.Collection || model("Collection", CollectionSchema);
export const Promotion = models.Promotion || model("Promotion", PromotionSchema);
export const Order = models.Order || model("Order", OrderSchema);
export const WebhookEvent = models.WebhookEvent || model("WebhookEvent", WebhookEventSchema);
export const Subscriber = models.Subscriber || model("Subscriber", SubscriberSchema);
export { mongoose };
