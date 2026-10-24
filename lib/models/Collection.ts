import mongoose, { Schema, models, model } from "mongoose";

const CollectionSchema = new Schema({
  slug: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: String,
  image: String,
  parent: { type: String, lowercase: true, trim: true },
  type: { type: String, enum: ["category", "style", "finish", "curated"], default: "curated" },
  sortOrder: { type: Number, default: 0 },
});

export const CollectionModel = (models.Collection as mongoose.Model<unknown>) || model("Collection", CollectionSchema);
