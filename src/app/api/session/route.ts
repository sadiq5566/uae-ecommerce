import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCartCount } from "@/features/cart/service";
import { getWishlistIds } from "@/features/wishlist/service";

// Per-user data: never cacheable. Pages stay static/cached; the client hydrates this on mount.
export async function GET() {
  const user = await getCurrentUser();
  const [cartCount, wishlist] = await Promise.all([getCartCount(), user ? getWishlistIds(user.id) : Promise.resolve([])]);
  return NextResponse.json(
    { user: user ? { name: user.name, role: user.role, avatar: user.avatar } : null, cartCount, wishlist },
    { headers: { "Cache-Control": "no-store" } },
  );
}
