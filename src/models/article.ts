import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const i18n = { en: { type: String, default: "" }, ar: { type: String, default: "" } };

const articleSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: i18n, excerpt: i18n, body: i18n, // body: plain text; blank line = new paragraph
    category: { type: String, trim: true }, // simple label, e.g. "Guides"
    cover: String, coverAlt: i18n, icon: { type: String, default: "📰" }, hue: { type: Number, default: 160 },
    author: { type: String, trim: true, maxlength: 80 },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    publishAt: Date, // published articles with a future publishAt go live automatically at that time
    seo: { title: i18n, description: i18n },
  },
  { timestamps: true },
);
articleSchema.index({ status: 1, publishAt: -1 });

export type ArticleDoc = InferSchemaType<typeof articleSchema>;
export const Article: Model<ArticleDoc> = (models.Article as Model<ArticleDoc>) ?? model("Article", articleSchema);
