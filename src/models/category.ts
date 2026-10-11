import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const i18n = { en: { type: String, required: true, trim: true }, ar: { type: String, required: true, trim: true } };

const categorySchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    slugHistory: [{ type: String, lowercase: true }],
    name: i18n,
    description: { en: String, ar: String },
    parent: { type: Schema.Types.ObjectId, ref: "Category", default: null, index: true },
    icon: { type: String, default: "🛍️" },
    hue: { type: Number, default: 160 },
    image: String,
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    // Category-specific attributes drive the data-driven filters.
    attributes: [{ _id: false, key: { type: String, required: true }, label: i18n }],
    seo: { title: { en: String, ar: String }, description: { en: String, ar: String } },
  },
  { timestamps: true },
);
categorySchema.index({ active: 1, order: 1 });

export type CategoryDoc = InferSchemaType<typeof categorySchema>;
export const Category: Model<CategoryDoc> = (models.Category as Model<CategoryDoc>) ?? model("Category", categorySchema);
