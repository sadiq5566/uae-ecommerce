import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type SessionUser } from "./session";
import { can, type Permission } from "./permissions";

/** Safe post-login redirect: same-site relative paths only (blocks open redirects like //evil.com). */
export const safeNext = (next: string | null | undefined, fallback: string) =>
  next && /^\/(?!\/)[^\\\s]*$/.test(next) ? next : fallback;

export async function requireUser(locale: string, next?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}

/** Signed in AND email verified (order tracking, returns and reviews need it). Unverified customers are sent to the page that mails them a code. */
export async function requireVerifiedUser(locale: string, next: string): Promise<SessionUser> {
  const user = await requireUser(locale, next);
  if (!user.emailVerified) redirect(`/${locale}/account/verify?next=${encodeURIComponent(next)}`);
  return user;
}

export class ForbiddenError extends Error { constructor() { super("FORBIDDEN"); } }

/** Server-side authorization for staff actions. Never rely on hidden UI. */
export async function requirePermission(perm: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || !can(user.role, perm)) throw new ForbiddenError();
  return user;
}
