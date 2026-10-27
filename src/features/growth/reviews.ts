import "server-only";
import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { absolute, button, esc, h, p } from "@/lib/email";
import type { Locale } from "@/lib/i18n";
import { Coupon } from "@/models/coupon";
import { Order } from "@/models/order";
import { Product } from "@/models/product";
import { Review } from "@/models/review";
import { ReviewReward } from "@/models/review-reward";
import { User } from "@/models/user";
import { dateIn, sendLifecycleEmail } from "./mail";

const DAY = 86_400_000;
/** Ask for a review this long after delivery, and stop asking after REQUEST_UNTIL_DAYS. */
export const REVIEW_REQUEST_AFTER_DAYS = 5;
const REQUEST_UNTIL_DAYS = 30;
/** The thank-you coupon for an approved verified review. */
export const REVIEW_REWARD = { percent: 10, maxDiscount: 100, validDays: 60 };

const ASK = {
  en: { subject: "How was your order?", title: "Tell us what you think", body: `Your order has arrived. Share a quick review — once it's approved you get <b>${REVIEW_REWARD.percent}% off</b> your next order.`, cta: "Write a review" },
  ar: { subject: "كيف كان طلبك؟", title: "شاركنا رأيك", body: `وصل طلبك. اكتب تقييماً سريعاً — وبعد الموافقة عليه تحصل على <b>خصم ${REVIEW_REWARD.percent}%</b> على طلبك القادم.`, cta: "اكتب تقييماً" },
} as const;
const THANKS = {
  en: { subject: "Thank you for your review", title: "Thank you!", body: (c: string, d: string) => `Your review is live. Here is <b>${REVIEW_REWARD.percent}% off</b> your next order: use code <b>${c}</b> at checkout (one use, valid until ${d}).`, cta: "Shop now" },
  ar: { subject: "شكراً على تقييمك", title: "شكراً لك!", body: (c: string, d: string) => `تم نشر تقييمك. إليك <b>خصم ${REVIEW_REWARD.percent}%</b> على طلبك القادم: استخدم الكود <b>${c}</b> عند الدفع (استخدام واحد، صالح حتى ${d}).`, cta: "تسوّق الآن" },
} as const;

/** Delivered orders of verified customers, 5–30 days after delivery: one email linking the products they haven't reviewed yet. */
export async function sendReviewRequests(now = new Date()): Promise<{ sent: number }> {
  await connectDb();
  const orders = await Order.find({
    status: "delivered", user: { $exists: true, $ne: null }, reviewRequestedAt: { $exists: false },
    timeline: { $elemMatch: { status: "delivered", at: { $lte: new Date(now.getTime() - REVIEW_REQUEST_AFTER_DAYS * DAY), $gte: new Date(now.getTime() - REQUEST_UNTIL_DAYS * DAY) } } },
  }).limit(100).lean();
  let sent = 0;
  for (const o of orders) {
    try {
      const mark = () => Order.updateOne({ _id: o._id }, { $set: { reviewRequestedAt: now } });
      const u = await User.findOne({ _id: o.user, status: "active", emailVerifiedAt: { $exists: true } }).select("email locale").lean();
      if (!u) { await mark(); continue; }
      const ids = [...new Set(o.items.map((i) => String(i.productId)))];
      const done = new Set((await Review.find({ user: o.user, product: { $in: ids } }).select("product").lean()).map((r) => String(r.product)));
      const todo = (await Product.find({ _id: { $in: ids.filter((x) => !done.has(x)) }, status: "active" }).select("slug name").lean()) as unknown as { slug: string; name: string }[];
      if (!todo.length) { await mark(); continue; }
      const l: Locale = u.locale === "ar" ? "ar" : "en"; const t = ASK[l];
      const list = todo.slice(0, 5).map((x) => `<li style="margin:0 0 8px"><a href="${esc(absolute(`/${l}/p/${x.slug}#reviews`))}" style="color:#1e4d6b;font-weight:600">${esc(x.name)}</a></li>`).join("");
      const body = h(t.title) + p(t.body) + `<ul style="margin:0 0 18px;padding-inline-start:18px;font:400 14px Arial,sans-serif">${list}</ul>` + button(absolute(`/${l}/p/${todo[0].slug}#reviews`) ?? "#", t.cta);
      if (!(await sendLifecycleEmail(u.email, l, t.subject, t.subject, body, t.title))) continue;
      await mark();
      sent++;
    } catch (e) { console.warn("[growth] review request failed:", (e as Error).message); }
  }
  return { sent };
}

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const code = () => "THANKS-" + Array.from(randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join("");

/**
 * When a VERIFIED-purchase review is approved: a single-use 10% coupon, at most once per order (the unique order key makes a second
 * approval, or a second review on the same order, a no-op). Returns the code when one was issued.
 */
export async function rewardApprovedReview(reviewId: string | Types.ObjectId): Promise<string | null> {
  await connectDb();
  const r = await Review.findOne({ _id: reviewId, status: "approved", verified: true, order: { $exists: true, $ne: null } }).lean();
  if (!r?.order) return null;
  try {
    await ReviewReward.create({ order: r.order, user: r.user, review: r._id });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return null; // this order already earned its reward
    throw e;
  }
  const u = await User.findOne({ _id: r.user, status: "active" }).select("email locale").lean();
  const ends = new Date(Date.now() + REVIEW_REWARD.validDays * DAY);
  let c = code();
  for (let i = 0; ; i++) {
    try {
      await Coupon.create({ code: c, type: "percent", value: REVIEW_REWARD.percent, maxDiscount: REVIEW_REWARD.maxDiscount, minSubtotal: 0, active: true, public: false, usageLimit: 1, perCustomerLimit: 1, endsAt: ends, description: { en: "Thank-you for your review", ar: "شكراً على تقييمك" } });
      break;
    } catch (e) { if ((e as { code?: number }).code === 11000 && i < 5) { c = code(); continue; } throw e; }
  }
  await ReviewReward.updateOne({ order: r.order }, { $set: { code: c } });
  if (u) {
    const l: Locale = u.locale === "ar" ? "ar" : "en"; const t = THANKS[l];
    const body = h(t.title) + p(t.body(esc(c), esc(dateIn(l, ends)))) + button(absolute(`/${l}`) ?? "#", t.cta);
    await sendLifecycleEmail(u.email, l, t.subject, t.subject, body, `${t.title} ${c}`);
  }
  return c;
}
