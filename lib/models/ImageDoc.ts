import mongoose, { Schema, models, model } from "mongoose";

const ImageSchema = new Schema({ data: Buffer, contentType: String, size: Number, createdAt: { type: Date, default: Date.now } });

export const ImageDoc = (models.ImageDoc as mongoose.Model<unknown>) || model("ImageDoc", ImageSchema);
