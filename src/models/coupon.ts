import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const couponSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, match: /^[A-Z0-9_-]{3,30}$/ },
    description: { en: String, ar: String },
    type: { type: String, enum: ["percent", "fixed"], required: true },
    value: { type: Number, required: true, min: 0 }, // percent: 0-100, fixed: AED
    maxDiscount: { type: Number, min: 0 }, // cap for percent coupons
    minSubtotal: { type: Number, default: 0, min: 0 },
    startsAt: Date,
    endsAt: Date,
    active: { type: Boolean, default: true },
    usageLimit: { type: Number, min: 1 }, // total redemptions; unset = unlimited
    usedCount: { type: Number, default: 0, min: 0 },
    perCustomerLimit: { type: Number, default: 1, min: 1 },
    products: [{ type: Schema.Types.ObjectId, ref: "Product" }], // empty = all
    categories: [{ type: Schema.Types.ObjectId, ref: "Category" }],
    excludeProducts: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    excludeCategories: [{ type: Schema.Types.ObjectId, ref: "Category" }],
    // Coupons never stack with item sale prices unless explicitly allowed. Only one coupon per order, always.
    stackWithSale: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type CouponDoc = InferSchemaType<typeof couponSchema>;
export const Coupon: Model<CouponDoc> = (models.Coupon as Model<CouponDoc>) ?? model("Coupon", couponSchema);
