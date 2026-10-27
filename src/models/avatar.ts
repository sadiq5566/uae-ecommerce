import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** A customer's profile picture, kept small (the browser shrinks it to ~256 px first) and served through /avatars/<userId>.jpg. */
const schema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  contentType: { type: String, enum: ["image/jpeg", "image/png", "image/webp"], required: true },
  data: { type: Buffer, required: true },
  version: { type: Number, required: true }, // changes on every upload so caches refresh
});

export type AvatarDoc = InferSchemaType<typeof schema>;
export const Avatar: Model<AvatarDoc> = (models.Avatar as Model<AvatarDoc>) ?? model("Avatar", schema);
