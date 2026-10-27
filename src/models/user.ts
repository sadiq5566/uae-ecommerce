import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

export const ROLES = ["customer", "owner", "catalog_manager", "operations_manager", "content_editor"] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: "customer", index: true },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    locale: { type: String, enum: ["en", "ar"], default: "en" },
    // Bounded list (see WISHLIST_MAX) — avoids unbounded embedded arrays.
    wishlist: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    referralCode: { type: String, uppercase: true, trim: true, index: { unique: true, sparse: true } }, // "invite a friend" code, made on first use
    emailVerifiedAt: Date, // proven by a one-time code; web credit and old-order linking require it
    lastLoginAt: Date,
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User: Model<UserDoc> = (models.User as Model<UserDoc>) ?? model("User", userSchema);
