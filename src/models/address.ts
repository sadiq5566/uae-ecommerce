import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

export const EMIRATES = ["abu-dhabi", "dubai", "sharjah", "ajman", "umm-al-quwain", "ras-al-khaimah", "fujairah"] as const;
export type Emirate = (typeof EMIRATES)[number];

const addressSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    label: { type: String, trim: true, maxlength: 40 },
    recipientName: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true },
    emirate: { type: String, enum: EMIRATES, required: true },
    area: { type: String, required: true, trim: true, maxlength: 100 },
    street: { type: String, trim: true, maxlength: 150 },
    building: { type: String, required: true, trim: true, maxlength: 100 },
    unit: { type: String, trim: true, maxlength: 40 },
    landmark: { type: String, trim: true, maxlength: 150 },
    instructions: { type: String, trim: true, maxlength: 300 },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type AddressDoc = InferSchemaType<typeof addressSchema>;
export const Address: Model<AddressDoc> = (models.Address as Model<AddressDoc>) ?? model("Address", addressSchema);
