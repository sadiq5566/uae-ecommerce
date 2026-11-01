import { Schema, model, models, type Model, type Types } from "mongoose";

export const ADJUSTMENT_KINDS = ["add", "deduct"] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];

/**
 * One manual change to a customer's web credit, made by a staff member: who, when, how much, why, and the balance before and after.
 * The credit itself lives in CreditLot; this is the permanent record next to it (lots get used up and expire, this row stays).
 */
const schema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ADJUSTMENT_KINDS, required: true },
    amountFils: { type: Number, required: true, min: 1 },
    balanceBeforeFils: { type: Number, required: true },
    balanceAfterFils: { type: Number, required: true },
    reason: { type: String, required: true, maxlength: 200 },
    adminId: { type: Schema.Types.ObjectId, ref: "User" },
    adminEmail: String,
    adminName: String,
    lot: Schema.Types.ObjectId, // "add": the lot that was issued
    lots: [{ _id: false, lot: Schema.Types.ObjectId, fils: Number }], // "deduct": which lots the money was taken from
    notified: { type: Boolean, default: false }, // the customer was emailed
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ createdAt: -1 });
schema.index({ user: 1, createdAt: -1 });

export interface CreditAdjustmentDoc { _id: Types.ObjectId; user: Types.ObjectId; kind: AdjustmentKind; amountFils: number; balanceBeforeFils: number; balanceAfterFils: number; reason: string; adminId?: Types.ObjectId; adminEmail?: string; adminName?: string; lot?: Types.ObjectId; lots?: { lot: Types.ObjectId; fils: number }[]; notified: boolean; createdAt: Date }
export const CreditAdjustment = ((models.CreditAdjustment as unknown as Model<CreditAdjustmentDoc>) ?? model<CreditAdjustmentDoc>("CreditAdjustment", schema)) as Model<CreditAdjustmentDoc>;
