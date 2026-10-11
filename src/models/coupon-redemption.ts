import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const schema = new Schema(
  {
    coupon: { type: Schema.Types.ObjectId, ref: "Coupon", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    amount: { type: Number, required: true },
  },
  { timestamps: true },
);
schema.index({ coupon: 1, user: 1 });
schema.index({ order: 1 }, { unique: true });

export type CouponRedemptionDoc = InferSchemaType<typeof schema>;
export const CouponRedemption: Model<CouponRedemptionDoc> = (models.CouponRedemption as Model<CouponRedemptionDoc>) ?? model("CouponRedemption", schema);
