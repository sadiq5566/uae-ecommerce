import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { connectDb } from "@/lib/db";
import { Session } from "@/models/session";
import { User } from "@/models/user";
import type { Role } from "@/models/user";

import { SESSION_COOKIE as COOKIE, secureCookie, ttlFor } from "./cookies";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export type SessionUser = { id: string; email: string; name: string; phone?: string; role: Role; locale: "en" | "ar"; emailVerified: boolean; avatar?: string };

export async function createSession(userId: string) {
  await connectDb();
  const maxAge = ttlFor((await User.findById(userId).select("role").lean())?.role); // staff sessions are shorter
  const token = randomBytes(32).toString("base64url");
  await Session.create({ tokenHash: sha(token), user: userId, expiresAt: new Date(Date.now() + maxAge * 1000) });
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: secureCookie, sameSite: "lax", path: "/", maxAge });
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
  return { id: String(u._id), email: u.email, name: u.name, phone: u.phone ?? undefined, role: u.role, locale: u.locale, emailVerified: !!u.emailVerifiedAt || u.role !== "customer", avatar: u.avatarVersion ? `/avatars/${u._id}.jpg?v=${u.avatarVersion}` : undefined }; // staff are not asked to verify
});
