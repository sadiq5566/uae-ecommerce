"use server";
import { getCurrentUser } from "@/lib/auth/session";
import { toggleWishlist } from "./service";

export type WishlistResult = { ok: boolean; ids?: string[]; added?: boolean; error?: "auth" | "not_found" | "full" };

export async function toggleWishlistAction(productId: string): Promise<WishlistResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "auth" };
  const r = await toggleWishlist(user.id, String(productId));
  return "error" in r ? { ok: false, error: r.error } : { ok: true, ids: r.ids, added: r.added };
}
