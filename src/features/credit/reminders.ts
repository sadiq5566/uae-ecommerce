import "server-only";
import { connectDb } from "@/lib/db";
import { absolute, button, emailLayout, esc, getBrand, h, p, rows } from "@/lib/email";
import { formatAED, type Locale } from "@/lib/i18n";
import { getMailer } from "@/lib/mailer";
import { CreditLot } from "@/models/credit-lot";
import { User } from "@/models/user";

const DAY = 86_400_000;
/** How long before expiry the reminder goes out. */
export const REMIND_DAYS = 7;

const COPY = {
  en: { subject: (a: string) => `Your ${a} web credit expires soon`, title: "Your web credit is about to expire", body: (a: string, d: string) => `You have <b>${a}</b> of web credit that expires on <b>${d}</b>. Tick “Use web credit first” at checkout to use it.`, left: "Credit expiring", on: "Expires on", cta: "Shop now" },
  ar: { subject: (a: string) => `رصيدك ${a} في المتجر ينتهي قريباً`, title: "رصيدك في المتجر على وشك الانتهاء", body: (a: string, d: string) => `لديك رصيد <b>${a}</b> ينتهي في <b>${d}</b>. فعّل «استخدم رصيد المتجر أولاً» عند الدفع للاستفادة منه.`, left: "الرصيد المنتهي", on: "ينتهي في", cta: "تسوّق الآن" },
} as const;

/**
 * One email per customer for credit that expires within REMIND_DAYS, sent once per lot (the lot is marked after the mail goes out).
 * Meant to run from the scheduled maintenance call. Never throws for one customer's failure.
 */
export async function sendExpiryReminders(now = new Date()): Promise<{ customers: number; lots: number }> {
  await connectDb();
  const lots = await CreditLot.find({ remainingFils: { $gt: 0 }, expiresAt: { $gt: now, $lte: new Date(now.getTime() + REMIND_DAYS * DAY) }, reminderSentAt: { $exists: false } }).lean();
  const byUser = new Map<string, typeof lots>();
  for (const l of lots) byUser.set(String(l.user), [...(byUser.get(String(l.user)) ?? []), l]);
  let customers = 0; let marked = 0;
  for (const [uid, mine] of byUser) {
    try {
      const u = await User.findOne({ _id: uid, status: "active", emailVerifiedAt: { $exists: true } }).select("email locale").lean();
      if (!u) continue;
      const l: Locale = u.locale === "ar" ? "ar" : "en";
      const c = COPY[l]; const b = await getBrand(l);
      const fils = mine.reduce((a, x) => a + x.remainingFils, 0);
      const first = new Date(Math.min(...mine.map((x) => x.expiresAt.getTime())));
      const amount = formatAED(fils / 100, l);
      const when = new Intl.DateTimeFormat(l === "ar" ? "ar-AE" : "en-AE", { dateStyle: "long", timeZone: "Asia/Dubai" }).format(first);
      const res = await getMailer().send({
        to: u.email, subject: c.subject(amount), text: `${c.title}: ${amount} — ${when}`,
        html: emailLayout(b, { preheader: c.subject(amount), body: h(c.title) + p(c.body(esc(amount), esc(when))) + rows([[c.left, esc(amount)], [c.on, esc(when)]]) + button(absolute(`/${l}/account/credit`) ?? b.url, c.cta) }),
      });
      if (!res.sent && process.env.NODE_ENV === "production") continue; // mail not delivered: try again on the next run
      await CreditLot.updateMany({ _id: { $in: mine.map((x) => x._id) } }, { $set: { reminderSentAt: now } });
      customers++; marked += mine.length;
    } catch (e) { console.warn("[credit] reminder failed:", (e as Error).message); }
  }
  return { customers, lots: marked };
}
