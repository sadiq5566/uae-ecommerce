import { Schema, model, models, type Model } from "mongoose";

// Singleton store configuration (key = "store"). Edited from the admin in Phase 5; never holds secrets.
const settingsSchema = new Schema(
  {
    key: { type: String, default: "store", unique: true },
    storeName: { en: { type: String, default: "Souq UAE" }, ar: { type: String, default: "سوق الإمارات" } },
    currency: { type: String, default: "AED" },
    // Money rules. All amounts are AED; calculations run in integer fils and round half up.
    minOrder: { type: Number, default: 50, min: 0 },
    freeDeliveryThreshold: { type: Number, default: 200, min: 0 },
    baseDeliveryFee: { type: Number, default: 15, min: 0 }, // used when no zone matches the emirate
    codEnabled: { type: Boolean, default: true },
    codFee: { type: Number, default: 0, min: 0 },
    codMaxOrder: { type: Number, default: 3000, min: 0 }, // 0 = no limit
    // VAT is OFF by default: confirm treatment with your accountant/FTA registration before enabling.
    tax: { enabled: { type: Boolean, default: false }, rate: { type: Number, default: 0.05, min: 0, max: 1 }, pricesIncludeTax: { type: Boolean, default: true }, label: { en: { type: String, default: "VAT" }, ar: { type: String, default: "ضريبة القيمة المضافة" } } },
    pendingPaymentMinutes: { type: Number, default: 30, min: 5 }, // unpaid card orders release stock after this
    supportEmail: String,
    supportPhone: String,
    logo: String,
  },
  { timestamps: true },
);

type L10n = { en: string; ar: string };
export interface SettingsDoc {
  key: string; storeName: L10n; currency: string; minOrder: number; freeDeliveryThreshold: number; baseDeliveryFee: number;
  codEnabled: boolean; codFee: number; codMaxOrder: number;
  tax: { enabled: boolean; rate: number; pricesIncludeTax: boolean; label: L10n };
  pendingPaymentMinutes: number; supportEmail?: string; supportPhone?: string; logo?: string;
}
export const Settings = ((models.Settings as unknown as Model<SettingsDoc>) ?? model<SettingsDoc>("Settings", settingsSchema)) as Model<SettingsDoc>;
