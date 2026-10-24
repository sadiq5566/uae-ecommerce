import mongoose, { Schema, models, model } from "mongoose";

// A brand is the maker of a product (Rolex, Zegna...). Categories (watches, bags...) are a separate thing; a product has both.
// Products keep the brand NAME in `brand`; this collection holds the brand's page: logo, banner, description, order.
const BrandSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    logo: { type: String, default: "" },
    image: { type: String, default: "" },
    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const BrandModel = (models.Brand as mongoose.Model<unknown>) || model("Brand", BrandSchema);
