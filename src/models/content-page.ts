import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

// Editable static pages (about, contact, FAQ, delivery, returns, privacy, terms, help). Legal copy is supplied by the merchant.
export const PAGE_SLUGS = ["about", "contact", "faq", "delivery", "returns", "privacy", "terms", "help"] as const;
export type PageSlug = (typeof PAGE_SLUGS)[number];

const i18n = { en: { type: String, default: "" }, ar: { type: String, default: "" } };
const pageSchema = new Schema(
  { slug: { type: String, required: true, unique: true, enum: PAGE_SLUGS }, title: i18n, body: i18n, published: { type: Boolean, default: false }, updatedBy: { type: Schema.Types.ObjectId, ref: "User" } },
  { timestamps: true },
);

export type ContentPageDoc = InferSchemaType<typeof pageSchema>;
export const ContentPage: Model<ContentPageDoc> = (models.ContentPage as Model<ContentPageDoc>) ?? model("ContentPage", pageSchema);
