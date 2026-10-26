"use server";
import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { connectDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroyAllSessions, destroySession, getCurrentUser } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/guard";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getMailer } from "@/lib/mailer";
import { isLocale } from "@/lib/i18n";
import { mergeGuestCart } from "@/features/cart/service";
import { EmailOtp } from "@/models/email-otp";
import { PasswordReset } from "@/models/password-reset";
import { User } from "@/models/user";
import { checkOtp, claimGuestOrders, sendOtp, type OtpPurpose } from "./otp";
import { echo, fieldErrors, forgotSchema, loginSchema, registerSchema, resetSchema, type FormState } from "./schemas";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const loc = (fd: FormData) => { const l = str(fd, "locale"); return isLocale(l) ? l : "en"; };

export async function registerAction(_: FormState, fd: FormData): Promise<FormState> {
  const locale = loc(fd);
  const parsed = registerSchema.safeParse({ name: str(fd, "name"), email: str(fd, "email"), password: str(fd, "password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: echo(fd) };
  const [byIp, byEmail] = await Promise.all([rateLimit(`register:${await clientIp()}`, 10, 3600), rateLimit(`register-email:${parsed.data.email}`, 5, 3600)]);
  if (!byIp.ok || !byEmail.ok) return { error: "rate_limited", values: echo(fd) };
  await connectDb();
  const existing = await User.findOne({ email: parsed.data.email }).select("role emailVerifiedAt").lean();
  if (existing && (existing.emailVerifiedAt || existing.role !== "customer")) return { fieldErrors: { email: "email_taken" }, values: echo(fd) };
  const next = safeNext(str(fd, "next"), "");
  const passwordHash = await hashPassword(parsed.data.password);
  if (existing) {
    // An UNVERIFIED account already holds this email (someone may have typed it without owning it): only the person who proves the
    // inbox can take it over, so the new details wait beside a code and nothing about the old account changes until it is entered.
    await sendOtp(parsed.data.email, "register", locale, { name: parsed.data.name, passwordHash, locale, next }, { force: true });
    redirect(verifyUrl(locale, parsed.data.email, "register", next));
  }
  // New customers get their account straight away (they can shop and check out); a code is mailed to verify the email, which is
  // needed for tracking orders, returns and reviews. They may skip it and verify later from the account.
  let user;
  try {
    user = await User.create({ name: parsed.data.name, email: parsed.data.email, passwordHash, locale });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return { fieldErrors: { email: "email_taken" }, values: echo(fd) }; // lost a race
    throw e;
  }
  await createSession(String(user._id));
  await mergeGuestCart(String(user._id));
  await sendOtp(parsed.data.email, "verify", locale, { next }, { force: true });
  redirect(verifyUrl(locale, parsed.data.email, "verify", next));
}

const verifyUrl = (locale: string, email: string, purpose: OtpPurpose, next: string) =>
  `/${locale}/verify-email?email=${encodeURIComponent(email)}${purpose === "verify" ? "&purpose=verify" : ""}${next ? `&next=${encodeURIComponent(next)}` : ""}`;

/** Finish sign-in once the email is proven: session, guest cart, and every earlier order placed with this email. */
async function startAccountSession(userId: string, email: string, locale: string, next: string): Promise<never> {
  await createSession(userId);
  await mergeGuestCart(userId);
  await claimGuestOrders(userId, email);
  redirect(safeNext(next, `/${locale}/account`));
}

export async function verifyEmailAction(_: FormState, fd: FormData): Promise<FormState> {
  const locale = loc(fd);
  const email = str(fd, "email").trim().toLowerCase().slice(0, 254);
  const purpose: OtpPurpose = str(fd, "purpose") === "verify" ? "verify" : "register";
  const code = str(fd, "code").replace(/\s/g, "");
  if (!email || !/^\d{6}$/.test(code)) return { error: "otp_invalid" };
  const [byIp, byEmail] = await Promise.all([rateLimit(`otp-ip:${await clientIp()}`, 30, 900), rateLimit(`otp:${email}`, 12, 900)]);
  if (!byIp.ok || !byEmail.ok) return { error: "rate_limited" };
  const r = await checkOtp(email, purpose, code);
  if (!r.ok) return { error: r.error };
  await connectDb();
  const next = r.pending?.next ?? "";
  if (purpose === "register") {
    const p = r.pending;
    if (!p?.name || !p.passwordHash) return { error: "otp_expired" };
    // The proven owner of the inbox takes over an unverified account that someone else registered with this email.
    const held = await User.findOne({ email }).select("role emailVerifiedAt");
    let user;
    if (held) {
      if (held.emailVerifiedAt || held.role !== "customer") return { error: "email_taken" };
      user = await User.findOneAndUpdate({ _id: held._id }, { $set: { name: p.name, passwordHash: p.passwordHash, locale: p.locale ?? locale, emailVerifiedAt: new Date() } }, { returnDocument: "after" });
      await destroyAllSessions(String(held._id)); // whoever used the account before is signed out
    } else {
      try {
        user = await User.create({ email, name: p.name, passwordHash: p.passwordHash, locale: p.locale ?? locale, emailVerifiedAt: new Date() });
      } catch (e) {
        if ((e as { code?: number }).code === 11000) return { error: "email_taken" }; // registered meanwhile
        throw e;
      }
    }
    return startAccountSession(String(user!._id), email, locale, next);
  }
  const user = await User.findOneAndUpdate({ email, status: "active" }, { $set: { emailVerifiedAt: new Date(), lastLoginAt: new Date() } }, { returnDocument: "after" });
  if (!user) return { error: "otp_expired" };
  return startAccountSession(String(user._id), email, user.locale ?? locale, next);
}

export async function resendOtpAction(_: FormState, fd: FormData): Promise<FormState> {
  const locale = loc(fd);
  const email = str(fd, "email").trim().toLowerCase().slice(0, 254);
  const purpose: OtpPurpose = str(fd, "purpose") === "verify" ? "verify" : "register";
  const [byIp, byEmail] = await Promise.all([rateLimit(`otp-send-ip:${await clientIp()}`, 20, 3600), rateLimit(`otp-send:${email}`, 6, 3600)]);
  if (!byIp.ok || !byEmail.ok) return { error: "rate_limited" };
  await connectDb();
  // A code can only be re-sent for something that is waiting: a pending sign-up, or a real account still unverified.
  const waiting = purpose === "register" ? await EmailOtp.exists({ email, purpose }) : await User.exists({ email, status: "active", emailVerifiedAt: { $exists: false } });
  if (!waiting) return { error: "otp_expired" };
  const r = await sendOtp(email, purpose, isLocale(locale) ? locale : "en");
  return r.ok ? { ok: true } : { error: "otp_wait" };
}

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const locale = loc(fd);
  const parsed = loginSchema.safeParse({ email: str(fd, "email"), password: str(fd, "password") });
  if (!parsed.success) return { error: "invalid_credentials", values: echo(fd) };
  const { email, password } = parsed.data;
  const ip = await clientIp();
  const [byIp, byEmail] = await Promise.all([rateLimit(`login-ip:${ip}`, 30, 900), rateLimit(`login:${email}:${ip}`, 5, 900)]);
  if (!byIp.ok || !byEmail.ok) return { error: "rate_limited", values: echo(fd) };
  await connectDb();
  const user = await User.findOne({ email }).select("+passwordHash");
  const valid = await verifyPassword(password, user?.passwordHash);
  if (!user || !valid || user.status !== "active") return { error: "invalid_credentials", values: echo(fd) }; // same message for every failure
  const next = safeNext(str(fd, "next"), "");
  await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });
  await createSession(String(user._id));
  await mergeGuestCart(String(user._id));
  if (user.emailVerifiedAt) await claimGuestOrders(String(user._id), email); // earlier guest orders only follow a VERIFIED email
  redirect(safeNext(next, `/${user.locale ?? locale}/account`));
}

export async function logoutAction(fd: FormData) {
  await destroySession();
  redirect(`/${loc(fd)}`);
}

const RESET_TTL_MS = 60 * 60 * 1000;

export async function forgotPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const locale = loc(fd);
  const parsed = forgotSchema.safeParse({ email: str(fd, "email") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: echo(fd) };
  const ip = await clientIp();
  const rl = await rateLimit(`forgot:${parsed.data.email}:${ip}`, 5, 3600);
  if (!rl.ok) return { error: "rate_limited" };
  await connectDb();
  const user = await User.findOne({ email: parsed.data.email, status: "active" });
  if (user) {
    const token = randomBytes(32).toString("base64url");
    await PasswordReset.deleteMany({ user: user._id });
    await PasswordReset.create({ tokenHash: sha(token), user: user._id, expiresAt: new Date(Date.now() + RESET_TTL_MS) });
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    await getMailer().send({
      to: user.email, subject: "Reset your password",
      text: `Use this link within 1 hour to reset your password:\n${base}/${locale}/reset-password?token=${token}\n\nIf you didn't request this, ignore this email.`,
    });
  }
  // Identical response whether or not the account exists (prevents email enumeration).
  return { ok: true };
}

export async function resetPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const locale = loc(fd);
  const parsed = resetSchema.safeParse({ token: str(fd, "token"), password: str(fd, "password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const rl = await rateLimit(`reset:${await clientIp()}`, 10, 3600);
  if (!rl.ok) return { error: "rate_limited" };
  await connectDb();
  // Single use: atomically delete the token; if nothing was deleted it was invalid/used/expired.
  const rec = await PasswordReset.findOneAndDelete({ tokenHash: sha(parsed.data.token), expiresAt: { $gt: new Date() } });
  if (!rec) return { error: "reset_invalid" };
  await User.updateOne({ _id: rec.user }, { passwordHash: await hashPassword(parsed.data.password) });
  await User.updateOne({ _id: rec.user, emailVerifiedAt: { $exists: false } }, { emailVerifiedAt: new Date() }); // the reset link reached their inbox
  await destroyAllSessions(String(rec.user)); // sign out everywhere
  redirect(`/${locale}/login?reset=1`);
}

/** Signed-in but unverified: mail a code (once per cooldown) and open the code page. */
export async function sendVerifyCodeAction(fd: FormData) {
  const user = await getCurrentUser();
  const locale = loc(fd);
  const next = safeNext(str(fd, "next"), "");
  if (!user) redirect(`/${locale}/login`);
  if (user.emailVerified) redirect(safeNext(next, `/${locale}/account`));
  const [byIp, byEmail] = await Promise.all([rateLimit(`otp-send-ip:${await clientIp()}`, 20, 3600), rateLimit(`otp-send:${user.email}`, 6, 3600)]);
  if (byIp.ok && byEmail.ok) await sendOtp(user.email, "verify", user.locale, { next }); // inside the cooldown a code was just sent: just open the page
  redirect(verifyUrl(locale, user.email, "verify", next));
}
