// Adds the store's public coupons and lets every existing coupon work on items that are already on sale. Dry run unless --apply is given.
//   npm run db:seed-offers            report only
//   npm run db:seed-offers -- --apply writes
import mongoose from "mongoose";
import { Coupon } from "../src/models/coupon";

const apply = process.argv.includes("--apply") || process.env.npm_config_apply === "true";

// All of them also work on sale items. One coupon per order, and the larger of coupon / automatic offer wins (see features/checkout/pricing.ts).
const COUPONS = [
  { code: "WELCOME10", type: "percent" as const, value: 10, maxDiscount: 50, minSubtotal: 100, perCustomerLimit: 1, description: { en: "10% off (max AED 50) on orders over AED 100", ar: "خصم 10% (حتى 50 درهم) على الطلبات فوق 100 درهم" } },
  { code: "SAVE25", type: "fixed" as const, value: 25, minSubtotal: 200, perCustomerLimit: 3, description: { en: "AED 25 off orders over AED 200", ar: "خصم 25 درهم على الطلبات فوق 200 درهم" } },
  { code: "SAVE50", type: "fixed" as const, value: 50, minSubtotal: 400, perCustomerLimit: 3, description: { en: "AED 50 off orders over AED 400", ar: "خصم 50 درهم على الطلبات فوق 400 درهم" } },
  { code: "SAVE100", type: "fixed" as const, value: 100, minSubtotal: 800, perCustomerLimit: 2, description: { en: "AED 100 off orders over AED 800", ar: "خصم 100 درهم على الطلبات فوق 800 درهم" } },
  { code: "VIP15", type: "percent" as const, value: 15, maxDiscount: 150, minSubtotal: 600, perCustomerLimit: 2, description: { en: "15% off (max AED 150) on orders over AED 600", ar: "خصم 15% (حتى 150 درهم) على الطلبات فوق 600 درهم" } },
  { code: "WEEKEND12", type: "percent" as const, value: 12, maxDiscount: 80, minSubtotal: 250, perCustomerLimit: 2, description: { en: "12% off (max AED 80) on orders over AED 250", ar: "خصم 12% (حتى 80 درهم) على الطلبات فوق 250 درهم" } },
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB || undefined });
  const locked = await Coupon.countDocuments({ stackWithSale: { $ne: true } });
  const missing = (await Promise.all(COUPONS.map((c) => Coupon.exists({ code: c.code })))).filter((x) => !x).length;
  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${locked} existing coupons skip sale items, ${missing} of ${COUPONS.length} new coupons to create`);
  if (apply) {
    await Coupon.updateMany({ stackWithSale: { $ne: true } }, { $set: { stackWithSale: true } });
    // Existing coupons (same code) keep their usage counts and limits; only the offer text and amounts are refreshed.
    for (const c of COUPONS) await Coupon.updateOne({ code: c.code }, { $set: { ...c, active: true, public: true, stackWithSale: true }, $setOnInsert: { usedCount: 0 } }, { upsert: true });
    console.log("done");
  } else console.log("dry run: nothing written. Re-run with --apply.");
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
