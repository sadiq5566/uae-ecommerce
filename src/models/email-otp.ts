import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * One live one-time code per (email, purpose). `register` carries the not-yet-created account (the user row is only
 * written after the code is proven); `verify` confirms the email of an existing account.
 */
const schema = new Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  purpose: { type: String, enum: ["register", "verify"], required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  sentAt: { type: Date, default: Date.now },
  pending: { name: String, passwordHash: String, locale: { type: String, enum: ["en", "ar"] }, next: String },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});
schema.index({ email: 1, purpose: 1 }, { unique: true });

export type EmailOtpDoc = InferSchemaType<typeof schema>;
export const EmailOtp: Model<EmailOtpDoc> = (models.EmailOtp as Model<EmailOtpDoc>) ?? model("EmailOtp", schema);
