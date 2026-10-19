import "server-only";
import { cache } from "react";
import { cachedFor } from "@/lib/cross-request-cache";
import { connectDb } from "@/lib/db";
import { getSettings } from "@/features/checkout/prepare";
import type { PublicOffers } from "./shared";
export * from "./shared";
import { Coupon } from "@/models/coupon";

const loadPublicOffers = cachedFor("public-offers", 60, async (): Promise<PublicOffers> => {
  const s = await getSettings();
  const o = s.offers;
  return {
    freeDelivery: { enabled: s.freeDeliveryThreshold > 0, min: s.freeDeliveryThreshold },
    tier: { enabled: !!o?.tier?.enabled && o.tier.percent > 0, min: o?.tier?.minSubtotal ?? 500, pct: o?.tier?.percent ?? 10 },
    firstOrder: { enabled: !!o?.firstOrder?.enabled && o.firstOrder.percent > 0, pct: o?.firstOrder?.percent ?? 10 },
    cod: s.codEnabled, returnDays: s.returnWindowDays ?? 7,
    modal: { enabled: o?.modal?.enabled ?? true, delaySeconds: o?.modal?.delaySeconds ?? 2, version: o?.modal?.version ?? "1", collectLeads: o?.modal?.collectLeads ?? true, title: { en: o?.modal?.title?.en || undefined, ar: o?.modal?.title?.ar || undefined }, body: { en: o?.modal?.body?.en || undefined, ar: o?.modal?.body?.ar || undefined } },
  };
});
export const getPublicOffers = cache(loadPublicOffers);

export type PublicCoupon = { code: string; type: "percent" | "fixed"; value: number; minSubtotal: number; maxDiscount?: number; stackWithSale: boolean; endsAt?: string; description?: { en?: string; ar?: string } };

/** Coupons the admin chose to advertise (public = true) that are currently usable. */
export const getPublicCoupons = cachedFor("public-coupons", 30, async (): Promise<PublicCoupon[]> => {
  await connectDb();
  const now = new Date();
  const rows = await Coupon.find({
    active: true, public: true,
    $and: [{ $or: [{ startsAt: null }, { startsAt: { $lte: now } }] }, { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] }],
  }).sort({ createdAt: -1 }).limit(20).lean();
  return rows.filter((c) => c.usageLimit == null || c.usedCount < c.usageLimit).map((c) => ({
    code: c.code, type: c.type, value: c.value, minSubtotal: c.minSubtotal ?? 0, maxDiscount: c.maxDiscount ?? undefined, stackWithSale: !!c.stackWithSale, endsAt: c.endsAt?.toISOString(),
    description: c.description ? { en: c.description.en ?? undefined, ar: c.description.ar ?? undefined } : undefined,
  }));
});

