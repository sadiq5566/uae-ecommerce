import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

// One row per provider event id: the unique index makes webhook processing idempotent under retries/races.
const schema = new Schema({
  provider: { type: String, required: true },
  eventId: { type: String, required: true },
  type: String,
  order: { type: Schema.Types.ObjectId, ref: "Order" },
  outcome: { type: String, enum: ["processed", "ignored", "rejected"], default: "processed" },
  note: String,
  createdAt: { type: Date, default: Date.now, index: { expires: 60 * 60 * 24 * 90 } }, // keep 90 days
});
schema.index({ provider: 1, eventId: 1 }, { unique: true });

export type WebhookEventDoc = InferSchemaType<typeof schema>;
export const WebhookEvent: Model<WebhookEventDoc> = (models.WebhookEvent as Model<WebhookEventDoc>) ?? model("WebhookEvent", schema);
