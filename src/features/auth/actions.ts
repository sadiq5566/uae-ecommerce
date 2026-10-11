"use server";
import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { connectDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroyAllSessions, destroySession } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/guard";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getMailer } from "@/lib/mailer";
import { isLocale } from "@/lib/i18n";
import { mergeGuestCart } from "@/features/cart/service";
import { PasswordReset } from "@/models/password-reset";
import { User } from "@/models/user";
import { echo, fieldErrors, forgotSchema, loginSchema, registerSchema, resetSchema, type FormState } from "./schemas";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const loc = (fd: FormData) => { const l = str(fd, "locale"); return isLocale(l) ? l : "en"; };

export async function registerAction(_: FormState, fd: FormData): Promise<FormState> {
  const locale = loc(fd);
  const parsed = registerSchema.safeParse({ name: str(fd, "name"), email: str(fd, "email"), password: str(fd, "password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: echo(fd) };
  const rl = await rateLimit(`register:${await clientIp()}`, 10, 3600);
  if (!rl.ok) return { error: "rate_limited", values: echo(fd) };
  await connectDb();
  if (await User.exists({ email: parsed.data.email })) return { fieldErrors: { email: "email_taken" }, values: echo(fd) };
  let user;
  try {
    user = await User.create({ ...parsed.data, passwordHash: await hashPassword(parsed.data.password), locale });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return { fieldErrors: { email: "email_taken" }, values: echo(fd) }; // lost a race on the unique index
    throw e;
  }
  await createSession(String(user._id));
  await mergeGuestCart(String(user._id));
  redirect(safeNext(str(fd, "next"), `/${locale}/account`));
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
  await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });
  await createSession(String(user._id));
  await mergeGuestCart(String(user._id));
  redirect(safeNext(str(fd, "next"), `/${user.locale ?? locale}/account`));
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
  await destroyAllSessions(String(rec.user)); // sign out everywhere
  redirect(`/${locale}/login?reset=1`);
}
