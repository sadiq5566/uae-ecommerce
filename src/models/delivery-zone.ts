import { Schema, model, models, type Model } from "mongoose";

const i18n = { en: { type: String, required: true }, ar: { type: String, required: true } };

const zoneSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    name: i18n,
    emirates: [{ type: String, required: true }],
    fee: { type: Number, required: true, min: 0 },
    freeThreshold: { type: Number, min: 0 }, // overrides the store-wide threshold when set
    estimate: i18n, // customer-facing text, e.g. "1–2 business days"
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
zoneSchema.index({ active: 1, emirates: 1 });

type L10n = { en: string; ar: string };
export interface DeliveryZoneDoc { key: string; name: L10n; emirates: string[]; fee: number; freeThreshold?: number | null; estimate: L10n; active: boolean }
export const DeliveryZone = ((models.DeliveryZone as unknown as Model<DeliveryZoneDoc>) ?? model<DeliveryZoneDoc>("DeliveryZone", zoneSchema)) as Model<DeliveryZoneDoc>;
