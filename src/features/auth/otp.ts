import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { connectDb } from "@/lib/db";
import { getMailer } from "@/lib/mailer";
import { emailLayout, esc, getBrand, h, p } from "@/lib/email";
import type { Locale } from "@/lib/i18n";
import { EmailOtp, type EmailOtpDoc } from "@/models/email-otp";
import { Order } from "@/models/order";

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_RESEND_MS = 45_000;
export const OTP_MAX_ATTEMPTS = 5;
export type OtpPurpose = "register" | "verify";
export type Pending = NonNullable<EmailOtpDoc["pending"]>;

const hash = (email: string, purpose: OtpPurpose, code: string) => createHash("sha256").update(`${email}|${purpose}|${code}`).digest("hex");
const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const COPY = {
  en: { subject: (b: string) => `${b} — your verification code`, title: "Verify your email", intro: "Enter this code to finish setting up your account. It expires in 10 minutes.", ignore: "If you didn't ask for this, you can ignore this email — nothing will be created." },
  ar: { subject: (b: string) => `${b} — رمز التحقق`, title: "تأكيد بريدك الإلكتروني", intro: "أدخل هذا الرمز لإكمال إنشاء حسابك. ينتهي خلال 10 دقائق.", ignore: "إذا لم تطلب ذلك فتجاهل هذه الرسالة — لن يتم إنشاء أي شيء." },
} as const;

/** Create (or replace) the live code for this email and mail it. `wait` = seconds until another code may be requested. */
export async function sendOtp(email: string, purpose: OtpPurpose, locale: Locale, pending?: Pending, opts: { force?: boolean } = {}): Promise<{ ok: true } | { ok: false; wait: number }> {
  await connectDb();
  const now = Date.now();
  const cur = await EmailOtp.findOne({ email, purpose }).select("sentAt").lean();
  if (cur && !opts.force && now - cur.sentAt.getTime() < OTP_RESEND_MS) return { ok: false, wait: Math.ceil((OTP_RESEND_MS - (now - cur.sentAt.getTime())) / 1000) };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await EmailOtp.findOneAndUpdate(
    { email, purpose },
    { $set: { codeHash: hash(email, purpose, code), attempts: 0, sentAt: new Date(now), expiresAt: new Date(now + OTP_TTL_MS), ...(pending ? { pending } : {}) } },
    { upsert: true },
  );
  const b = await getBrand(locale); const c = COPY[locale];
  await getMailer().send({
    to: email, subject: c.subject(b.name), text: `${c.title}\n\n${code}\n\n${c.intro}\n${c.ignore}`,
    html: emailLayout(b, { preheader: `${code} — ${c.title}`, body: h(c.title) + p(esc(c.intro)) + `<p style="margin:18px 0;text-align:center;font:700 34px/1 'Courier New',monospace;letter-spacing:10px;color:#111" dir="ltr">${esc(code)}</p>` + p(`<span style="color:#6b6b6b">${esc(c.ignore)}</span>`) }),
  });
  return { ok: true };
}

export type OtpCheck = { ok: true; pending?: Pending } | { ok: false; error: "otp_invalid" | "otp_expired" | "otp_locked" };

/** Check a typed code. Wrong guesses are counted (5 max); a right code is consumed atomically, so it works once. */
export async function checkOtp(email: string, purpose: OtpPurpose, code: string): Promise<OtpCheck> {
  await connectDb();
  const rec = await EmailOtp.findOneAndUpdate({ email, purpose, expiresAt: { $gt: new Date() } }, { $inc: { attempts: 1 } }, { returnDocument: "after" }).lean();
  if (!rec) return { ok: false, error: "otp_expired" };
  if (rec.attempts > OTP_MAX_ATTEMPTS) { await EmailOtp.deleteOne({ _id: rec._id }); return { ok: false, error: "otp_locked" }; }
  if (!/^\d{6}$/.test(code) || !safeEq(rec.codeHash, hash(email, purpose, code))) return { ok: false, error: rec.attempts >= OTP_MAX_ATTEMPTS ? "otp_locked" : "otp_invalid" };
  const used = await EmailOtp.findOneAndDelete({ _id: rec._id, codeHash: rec.codeHash });
  return used ? { ok: true, pending: rec.pending ?? undefined } : { ok: false, error: "otp_expired" };
}

/**
 * A verified email owns every order placed with it as a guest. Called after the email is proven (never before):
 * it is what makes "my old orders" appear — and become returnable and reviewable — in the new account.
 */
export async function claimGuestOrders(userId: string, email: string): Promise<number> {
  await connectDb();
  const filter = { email: email.toLowerCase(), $or: [{ user: { $exists: false } }, { user: null }] };
  try {
    return (await Order.updateMany(filter, { $set: { user: userId, guest: false } })).modifiedCount;
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e;
    let n = 0; // a (user, idempotencyKey) clash on one order must not block the others
    for (const o of await Order.find(filter).select("_id").lean()) {
      try { n += (await Order.updateOne({ _id: o._id }, { $set: { user: userId, guest: false } })).modifiedCount; } catch { /* skip the clashing order */ }
    }
    return n;
  }
}
