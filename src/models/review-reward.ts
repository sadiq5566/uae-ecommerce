import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** The thank-you coupon for an approved verified review: at most one per order. */
const schema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    review: { type: Schema.Types.ObjectId, ref: "Review", required: true },
    code: String,
  },
  { timestamps: true },
);

export type ReviewRewardDoc = InferSchemaType<typeof schema>;
export const ReviewReward: Model<ReviewRewardDoc> = (models.ReviewReward as Model<ReviewRewardDoc>) ?? model("ReviewReward", schema);
