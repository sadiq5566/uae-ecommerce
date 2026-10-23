import mongoose, { Schema, models, model } from "mongoose";

const FaqSchema = new Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
  order: { type: Number, default: 0 },
});

export const FaqModel = (models.Faq as mongoose.Model<unknown>) || model("Faq", FaqSchema);
