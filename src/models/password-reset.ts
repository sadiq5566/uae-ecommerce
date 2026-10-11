import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const schema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

export type PasswordResetDoc = InferSchemaType<typeof schema>;
export const PasswordReset: Model<PasswordResetDoc> = (models.PasswordReset as Model<PasswordResetDoc>) ?? model("PasswordReset", schema);
