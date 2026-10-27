import "server-only";
import { randomBytes } from "node:crypto";
import { connectDb } from "@/lib/db";
import { absolute, button, esc, h, p } from "@/lib/email";
import { formatAED, type Locale } from "@/lib/i18n";
import { issueCredit } from "@/features/credit/service";
import { Order } from "@/models/order";
import { User } from "@/models/user";
import { sendLifecycleEmail } from "./mail";

/** AED of web credit each side gets once the friend's first order is delivered. */
export const REFERRAL_REWARD = 25;
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export const REFERRAL_COOKIE = "ref";
export const isReferralCode = (c: unknown): c is string => typeof c === "string" && /^[A-Z0-9-]{4,16}$/i.test(c);

/** The customer's invite code, created on first use. Only verified customers have one (credit needs a verified email). */
export async function getReferralCode(userId: string): Promise<string | null> {
  await connectDb();
  const u = await User.findOne({ _id: userId, emailVerifiedAt: { $exists: true } }).select("referralCode").lean();
  if (!u) return null;
  if (u.referralCode) return u.referralCode;
  for (let i = 0; i < 6; i++) {
    const code = "FRIEND-" + Array.from(randomBytes(5), (b) => ALPHABET[b % ALPHABET.length]).join("");
    try {
      const r = await User.updateOne({ _id: userId, referralCode: { $exists: false } }, { $set: { referralCode: code } });
      if (!r.modifiedCount) return (await User.findById(userId).select("referralCode").lean())?.referralCode ?? null; // a parallel request won
      return code;
    } catch (e) { if ((e as { code?: number }).code !== 11000) throw e; }
  }
  return null;
}

/**
 * Who a referral code belongs to, if it can be used by this buyer: a verified, active customer who is not the buyer themself.
 * Returns the referrer's id, or null (the code is then simply ignored; it never blocks an order).
 */
export async function resolveReferrer(code: string, buyer: { userId?: string; email?: string }): Promise<string | null> {
  if (!isReferralCode(code)) return null;
  await connectDb();
  const r = await User.findOne({ referralCode: code.toUpperCase(), status: "active", emailVerifiedAt: { $exists: true } }).select("email").lean();
  if (!r) return null;
  if (buyer.userId && String(r._id) === buyer.userId) return null;
  if (buyer.email && r.email === buyer.email.toLowerCase()) return null;
  return String(r._id);
}

const THANKS = {
  en: { subject: "You earned web credit", title: "A friend's first order arrived", body: (a: string, role: string) => `${role} <b>${a}</b> has been added to your web credit. Tick “Use web credit first” at checkout.`, referrer: "Thanks for inviting a friend!", referee: "Welcome! As a thank-you for joining through a friend,", cta: "My web credit" },
  ar: { subject: "حصلت على رصيد في المتجر", title: "وصل أول طلب لصديقك", body: (a: string, role: string) => `${role} تمت إضافة <b>${a}</b> إلى رصيدك في المتجر. فعّل «استخدم رصيد المتجر أولاً» عند الدفع.`, referrer: "شكراً لدعوتك صديقاً!", referee: "أهلاً بك! كشكر على انضمامك عبر صديق،", cta: "رصيدي" },
} as const;

/**
 * Pay out referrals whose first order has been DELIVERED (a cancelled or returned-and-refunded order never pays): the referrer and the new
 * customer each get REFERRAL_REWARD in web credit, once per order (the order is claimed with a conditional update first).
 * A guest buyer is rewarded when a verified account with their email exists; until then the order stays queued (30 days).
 */
export async function payReferralRewards(now = new Date()): Promise<{ paid: number }> {
  await connectDb();
  const orders = await Order.find({
    status: "delivered", "referral.referrer": { $exists: true }, "referral.rewardedAt": { $exists: false },
    createdAt: { $gte: new Date(now.getTime() - 60 * 86_400_000) },
  }).limit(100).lean();
  let paid = 0;
  for (const o of orders) {
    try {
      const referrer = await User.findOne({ _id: o.referral!.referrer, status: "active", emailVerifiedAt: { $exists: true } }).select("email locale").lean();
      const referee = o.user ? await User.findOne({ _id: o.user, status: "active", emailVerifiedAt: { $exists: true } }).select("email locale").lean()
        : o.email ? await User.findOne({ email: o.email, status: "active", emailVerifiedAt: { $exists: true } }).select("email locale").lean() : null;
      if (!referrer || !referee || String(referrer._id) === String(referee._id)) continue;
      const claimed = await Order.updateOne({ _id: o._id, "referral.rewardedAt": { $exists: false } }, { $set: { "referral.rewardedAt": now } });
      if (!claimed.modifiedCount) continue; // another run took it
      const note = { en: `Invite reward · order ${o.orderNumber}`, ar: `مكافأة دعوة · الطلب ${o.orderNumber}` };
      const lot = (u: typeof referrer, role: "referrer" | "referee") => issueCredit({ userId: u._id, amount: REFERRAL_REWARD, source: "referral", ref: `${o.orderNumber}:${role}`, note });
      try { await Promise.all([lot(referrer, "referrer"), lot(referee, "referee")]); }
      catch (e) { await Order.updateOne({ _id: o._id }, { $unset: { "referral.rewardedAt": 1 } }); throw e; } // retried on the next run
      for (const [u, role] of [[referrer, "referrer"], [referee, "referee"]] as const) {
        const l: Locale = u.locale === "ar" ? "ar" : "en"; const t = THANKS[l];
        const body = h(t.title) + p(t.body(esc(formatAED(REFERRAL_REWARD, l)), t[role])) + button(absolute(`/${l}/account/credit`) ?? "#", t.cta);
        await sendLifecycleEmail(u.email, l, t.subject, t.subject, body, `${t.title} ${formatAED(REFERRAL_REWARD, l)}`);
      }
      paid++;
    } catch (e) { console.warn("[growth] referral payout failed:", (e as Error).message); }
  }
  return { paid };
}

/** How many of this customer's invites have paid out, and what they earned. */
export async function referralStats(userId: string) {
  await connectDb();
  const [paid, pending] = await Promise.all([
    Order.countDocuments({ "referral.referrer": userId, "referral.rewardedAt": { $exists: true } }),
    Order.countDocuments({ "referral.referrer": userId, "referral.rewardedAt": { $exists: false }, status: { $nin: ["cancelled", "refunded"] } }),
  ]);
  return { paid, pending, earned: paid * REFERRAL_REWARD };
}
