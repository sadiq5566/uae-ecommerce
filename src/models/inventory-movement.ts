import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

// Append-only stock ledger: who/why/how many. Orders write here; admin adjustments (Phase 5) will too.
const schema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    sku: { type: String, required: true },
    delta: { type: Number, required: true },
    reason: { type: String, enum: ["order_placed", "order_cancelled", "order_expired", "manual_adjustment", "restock", "correction"], required: true },
    order: { type: Schema.Types.ObjectId, ref: "Order" },
    actor: { type: Schema.Types.ObjectId, ref: "User" },
    note: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type InventoryMovementDoc = InferSchemaType<typeof schema>;
export const InventoryMovement: Model<InventoryMovementDoc> = (models.InventoryMovement as Model<InventoryMovementDoc>) ?? model("InventoryMovement", schema);
