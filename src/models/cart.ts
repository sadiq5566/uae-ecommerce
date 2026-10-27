import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const cartSchema = new Schema(
  {
    // Exactly one owner: a signed-in user, or an anonymous guest id from an httpOnly cookie.
    user: { type: Schema.Types.ObjectId, ref: "User", unique: true, sparse: true },
    guestId: { type: String, unique: true, sparse: true },
    // Stored by SKU (variant SKU when the product has variants). Prices are NOT trusted from here.
    items: [{ _id: false, sku: { type: String, required: true }, qty: { type: Number, required: true, min: 1, max: 10 }, priceAtAdd: { type: Number, required: true } }],
    expiresAt: { type: Date, index: { expires: 0 } }, // set for guest carts only
    // Abandoned-cart reminder: the email typed at checkout (guests), the language, when the reminder went out, and a secret link to reopen the bag.
    email: { type: String, trim: true, lowercase: true },
    locale: { type: String, enum: ["en", "ar"] },
    remindedAt: Date,
    restoreToken: { type: String, index: { unique: true, sparse: true } },
  },
  { timestamps: true },
);

export type CartDoc = InferSchemaType<typeof cartSchema>;
export const Cart: Model<CartDoc> = (models.Cart as Model<CartDoc>) ?? model("Cart", cartSchema);
