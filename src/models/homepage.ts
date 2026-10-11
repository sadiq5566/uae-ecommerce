import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const i18n = { en: { type: String, default: "" }, ar: { type: String, default: "" } };

// Singleton (key = "home"): hero banners / campaigns and which collection sections show on the home page.
const homepageSchema = new Schema(
  {
    key: { type: String, default: "home", unique: true },
    banners: [{
      _id: false, id: String, active: { type: Boolean, default: true }, order: { type: Number, default: 0 },
      eyebrow: i18n, title: i18n, subtitle: i18n, ctaLabel: i18n, ctaHref: String, image: String, hue: { type: Number, default: 160 },
      startsAt: Date, endsAt: Date, // campaigns can be scheduled
    }],
    sections: {
      deals: { type: Boolean, default: true }, featured: { type: Boolean, default: true }, newArrivals: { type: Boolean, default: true },
      popular: { type: Boolean, default: true }, mostViewed: { type: Boolean, default: true }, journal: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

export type HomepageDoc = InferSchemaType<typeof homepageSchema>;
export const Homepage: Model<HomepageDoc> = (models.Homepage as Model<HomepageDoc>) ?? model("Homepage", homepageSchema);
