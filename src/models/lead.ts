import { Schema, model, models, type Model, type Types } from "mongoose";

export const LEAD_SOURCES = ["welcome_modal", "newsletter", "checkout", "register", "exit_intent"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

// A marketing contact captured before (or without) an order: modal, newsletter, guest checkout. One row per email / phone.
const leadSchema = new Schema(
  {
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 20 },
    name: { type: String, trim: true, maxlength: 100 },
    source: { type: String, enum: LEAD_SOURCES, required: true },
    locale: { type: String, enum: ["en", "ar"], default: "en" },
    marketingConsent: { type: Boolean, default: false }, // we only message people who ticked this
    consentAt: Date,
    unsubscribedAt: Date,
    orders: { type: Number, default: 0 },
    tags: [String],
  },
  { timestamps: true },
);
leadSchema.index({ email: 1 }, { unique: true, sparse: true });
leadSchema.index({ phone: 1 }, { unique: true, sparse: true });
leadSchema.index({ createdAt: -1 });

export interface LeadDoc {
  _id: Types.ObjectId; email?: string | null; phone?: string | null; name?: string | null; source: LeadSource; locale: "en" | "ar";
  marketingConsent: boolean; consentAt?: Date | null; unsubscribedAt?: Date | null; orders: number; tags: string[]; createdAt: Date; updatedAt: Date;
}
export const Lead = ((models.Lead as unknown as Model<LeadDoc>) ?? model<LeadDoc>("Lead", leadSchema)) as Model<LeadDoc>;
