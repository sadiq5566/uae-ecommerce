import { Schema, model, models, type Model, type Types } from "mongoose";

export const RETURN_STATUSES = ["requested", "approved", "received", "completed", "rejected", "cancelled"] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];
export const RETURN_REASONS = ["wrong_size", "wrong_color", "defective", "not_as_described", "changed_mind", "other"] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];
export const RETURN_RESOLUTIONS = ["credit", "exchange"] as const;
export type ReturnResolution = (typeof RETURN_RESOLUTIONS)[number];

// Free returns within the window: the customer gets web credit (refund into their account, 90 days) or a free exchange (size/colour).
const schema = new Schema(
  {
    number: { type: String, required: true, unique: true },
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    orderNumber: { type: String, required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    contact: { name: String, phone: String, email: String, locale: { type: String, enum: ["en", "ar"], default: "en" } },
    resolution: { type: String, enum: RETURN_RESOLUTIONS, required: true },
    reason: { type: String, enum: RETURN_REASONS, required: true },
    note: { type: String, maxlength: 500 },
    items: [{ _id: false, sku: { type: String, required: true }, productId: Schema.Types.ObjectId, name: { en: String, ar: String }, variantLabel: { en: String, ar: String }, qty: { type: Number, min: 1 }, value: Number, exchangeSku: String, exchangeLabel: { en: String, ar: String } }],
    status: { type: String, enum: RETURN_STATUSES, default: "requested", index: true },
    creditAmount: Number, // AED, what the credit coupon is worth (credit resolution)
    creditCode: String, // legacy coupon payout (returns completed before web credit, or by guests)
    creditExpiresAt: Date, // web credit lot expiry
    restocked: { type: Boolean, default: false },
    staffNote: String,
    timeline: [{ _id: false, status: String, at: { type: Date, default: Date.now }, by: String, note: String }],
  },
  { timestamps: true },
);
schema.index({ createdAt: -1 });

type L10n = { en: string; ar: string };
export interface ReturnDoc {
  _id: Types.ObjectId; number: string; order: Types.ObjectId; orderNumber: string; user?: Types.ObjectId | null;
  contact: { name?: string | null; phone?: string | null; email?: string | null; locale: "en" | "ar" };
  resolution: ReturnResolution; reason: ReturnReason; note?: string | null;
  items: { sku: string; productId?: Types.ObjectId; name: L10n; variantLabel?: L10n | null; qty: number; value: number; exchangeSku?: string | null; exchangeLabel?: L10n | null }[];
  status: ReturnStatus; creditAmount?: number | null; creditCode?: string | null; creditExpiresAt?: Date | null; restocked: boolean; staffNote?: string | null;
  timeline: { status: string; at: Date; by?: string; note?: string }[]; createdAt: Date; updatedAt: Date;
}
export const ReturnRequest = ((models.ReturnRequest as unknown as Model<ReturnDoc>) ?? model<ReturnDoc>("ReturnRequest", schema)) as Model<ReturnDoc>;
