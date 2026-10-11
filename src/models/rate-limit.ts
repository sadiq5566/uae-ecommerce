import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const schema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  resetAt: { type: Date, required: true, index: { expires: 0 } },
});

export type RateLimitDoc = InferSchemaType<typeof schema>;
export const RateLimit: Model<RateLimitDoc> = (models.RateLimit as Model<RateLimitDoc>) ?? model("RateLimit", schema);
