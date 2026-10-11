import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

// Only a SHA-256 hash of the cookie token is stored, so a DB leak cannot be replayed as sessions.
const sessionSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL: Mongo deletes expired rows
  createdAt: { type: Date, default: Date.now },
});

export type SessionDoc = InferSchemaType<typeof sessionSchema>;
export const Session: Model<SessionDoc> = (models.Session as Model<SessionDoc>) ?? model("Session", sessionSchema);
