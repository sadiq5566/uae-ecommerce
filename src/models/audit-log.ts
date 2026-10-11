import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

// Append-only record of sensitive admin actions. Never stores secrets, passwords or full personal data.
const schema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorEmail: String,
    action: { type: String, required: true }, // e.g. "product.update"
    entity: { type: String, required: true }, // e.g. "product"
    entityId: String,
    summary: { type: String, maxlength: 300 },
    meta: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ createdAt: -1 });
schema.index({ entity: 1, entityId: 1, createdAt: -1 });
schema.index({ actor: 1, createdAt: -1 });

export type AuditLogDoc = InferSchemaType<typeof schema>;
export const AuditLog: Model<AuditLogDoc> = (models.AuditLog as Model<AuditLogDoc>) ?? model("AuditLog", schema);
