import { Schema, model, models, type Model, type Types } from "mongoose";

export const CREDIT_SOURCES = ["return", "admin", "referral"] as const;
export type CreditSource = (typeof CREDIT_SOURCES)[number];

/**
 * Web credit is a set of lots, each with its own expiry (90 days from issue). Amounts are integer fils so repeated
 * spend/restore never drifts. Checkout spends the soonest-expiring lot first.
 */
const schema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amountFils: { type: Number, required: true, min: 1 },
    remainingFils: { type: Number, required: true, min: 0 },
    expiresAt: { type: Date, required: true },
    source: { type: String, enum: CREDIT_SOURCES, required: true },
    ref: String, // return number, or the staff member's note
    note: { en: String, ar: String },
    reminderSentAt: Date, // the "expires soon" email went out
  },
  { timestamps: true },
);
schema.index({ user: 1, expiresAt: 1 });
schema.index({ source: 1, ref: 1 }, { unique: true, partialFilterExpression: { source: "return" } }); // a return can only be paid out once

export interface CreditLotDoc { _id: Types.ObjectId; user: Types.ObjectId; amountFils: number; remainingFils: number; expiresAt: Date; source: CreditSource; ref?: string | null; note?: { en?: string | null; ar?: string | null } | null; createdAt: Date; updatedAt: Date }
export const CreditLot = ((models.CreditLot as unknown as Model<CreditLotDoc>) ?? model<CreditLotDoc>("CreditLot", schema)) as Model<CreditLotDoc>;
