import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { connectDb } from "@/lib/db";
import { Session } from "@/models/session";
import { User } from "@/models/user";
import type { Role } from "@/models/user";

const COOKIE = "session";
const MAX_AGE_S = 60 * 60 * 24 * 30;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export type SessionUser = { id: string; email: string; name: string; phone?: string; role: Role; locale: "en" | "ar" };

export async function createSession(userId: string) {
  await connectDb();
  const token = randomBytes(32).toString("base64url");
  await Session.create({ tokenHash: sha(token), user: userId, expiresAt: new Date(Date.now() + MAX_AGE_S * 1000) });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE_S,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) { await connectDb(); await Session.deleteOne({ tokenHash: sha(token) }); }
  jar.delete(COOKIE);
}

export async function destroyAllSessions(userId: string) {
  await connectDb();
  await Session.deleteMany({ user: userId });
}

/** Current user from the session cookie (memoised per request). Returns null for guests. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  await connectDb();
  const s = await Session.findOne({ tokenHash: sha(token), expiresAt: { $gt: new Date() } }).lean();
  if (!s) return null;
  const u = await User.findById(s.user).lean();
  if (!u || u.status !== "active") return null;
  return { id: String(u._id), email: u.email, name: u.name, phone: u.phone ?? undefined, role: u.role, locale: u.locale };
});
