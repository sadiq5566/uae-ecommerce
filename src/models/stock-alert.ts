import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** "Tell me when it is back": one row per (SKU, email). Cleared (notifiedAt set) once the email goes out; asking again re-arms it. */
const schema = new Schema(
  {
    sku: { type: String, required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    slug: String,
    email: { type: String, required: true, lowercase: true, trim: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    locale: { type: String, enum: ["en", "ar"], default: "en" },
    notifiedAt: Date,
  },
  { timestamps: true },
);
schema.index({ sku: 1, email: 1 }, { unique: true });
schema.index({ notifiedAt: 1, sku: 1 });

export type StockAlertDoc = InferSchemaType<typeof schema>;
export const StockAlert: Model<StockAlertDoc> = (models.StockAlert as Model<StockAlertDoc>) ?? model("StockAlert", schema);
