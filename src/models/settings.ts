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
    // Automatic offers (no code needed). One discount per order: the best of coupon / spend-tier / first-order wins.
    offers: {
      tier: { enabled: { type: Boolean, default: true }, minSubtotal: { type: Number, default: 500, min: 0 }, percent: { type: Number, default: 10, min: 0, max: 100 }, maxDiscount: { type: Number, min: 0 } },
      firstOrder: { enabled: { type: Boolean, default: true }, percent: { type: Number, default: 10, min: 0, max: 100 }, maxDiscount: { type: Number, min: 0 } },
      // Welcome modal shown once per visitor per `version` (bump the version to show it again to everyone).
      modal: { enabled: { type: Boolean, default: true }, delaySeconds: { type: Number, default: 2, min: 0, max: 60 }, version: { type: String, default: "1" }, collectLeads: { type: Boolean, default: true }, title: { en: String, ar: String }, body: { en: String, ar: String } },
    },
    returnWindowDays: { type: Number, default: 7, min: 0, max: 90 },
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
  offers: {
    tier: { enabled: boolean; minSubtotal: number; percent: number; maxDiscount?: number | null };
    firstOrder: { enabled: boolean; percent: number; maxDiscount?: number | null };
    modal: { enabled: boolean; delaySeconds: number; version: string; collectLeads: boolean; title?: Partial<L10n>; body?: Partial<L10n> };
  };
  returnWindowDays: number;
  pendingPaymentMinutes: number; supportEmail?: string; supportPhone?: string; logo?: string;
}
export const Settings = ((models.Settings as unknown as Model<SettingsDoc>) ?? model<SettingsDoc>("Settings", settingsSchema)) as Model<SettingsDoc>;
