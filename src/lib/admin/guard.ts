import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/auth/permissions";

/** For admin PAGES: sign-in required, then the permission is checked on the server for every request. */
export async function guard(perm: Permission, nextPath = "/admin"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/en/login?next=${encodeURIComponent(nextPath)}`);
  if (!can(user.role, perm)) redirect("/admin/forbidden");
  return user;
}

/** For server ACTIONS: returns null instead of redirecting, so the action can answer with an error state. */
export async function actor(perm: Permission): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  return user && can(user.role, perm) ? user : null;
}

export const FORBIDDEN = "You don't have permission to do that.";
