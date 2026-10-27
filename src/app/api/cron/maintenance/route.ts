import { timingSafeEqual } from "node:crypto";
import { refreshSalePrices } from "@/features/catalog/maintenance";
import { expirePendingOrders } from "@/features/orders/lifecycle";
import { sendExpiryReminders } from "@/features/credit/reminders";
import { sendAbandonedCartReminders } from "@/features/growth/abandoned-cart";
import { payReferralRewards } from "@/features/growth/referrals";
import { sendReviewRequests } from "@/features/growth/reviews";
import { sendBackInStockAlerts } from "@/features/growth/stock-alerts";

export const dynamic = "force-dynamic";

/**
 * Scheduled maintenance (call every 5 minutes, `Authorization: Bearer $CRON_SECRET`):
 *  - cancels unpaid online-payment orders past their window and releases stock
 *  - applies scheduled sale prices (start/end)
 *  - emails customers whose web credit expires within 7 days (once per credit)
 *  - abandoned-cart reminders, back-in-stock alerts, review requests after delivery, and referral rewards for delivered first orders
 * Scheduled articles/banners need no job: they are filtered by date at read time.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const a = Buffer.from(given), b = Buffer.from(secret);
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) return new Response("unauthorized", { status: 401 });
  const [orders, prices, credit] = await Promise.all([expirePendingOrders(), refreshSalePrices(), sendExpiryReminders()]);
  // Customer-facing emails run one after another (they share the mail connection and each job is bounded).
  const growth = { carts: await sendAbandonedCartReminders(), stock: await sendBackInStockAlerts(), reviews: await sendReviewRequests(), referrals: await payReferralRewards() };
  return Response.json({ orders, prices, credit, growth });
}
