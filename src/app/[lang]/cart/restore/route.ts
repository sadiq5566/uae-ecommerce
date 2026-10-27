import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { connectDb } from "@/lib/db";
import { CART_COOKIE, secureCookie } from "@/lib/auth/cookies";
import { isLocale } from "@/lib/i18n";
import { Cart } from "@/models/cart";

/** The link in the abandoned-cart email: reopens the same bag on any device (a guest bag by taking over its cookie; an account bag after sign-in). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ lang: string }> }) {
  const { lang } = await ctx.params;
  const locale = isLocale(lang) ? lang : "en";
  const token = req.nextUrl.searchParams.get("t") ?? "";
  const home = new URL(`/${locale}/cart`, req.url);
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return NextResponse.redirect(home);
  await connectDb();
  const c = await Cart.findOne({ restoreToken: token }).select("guestId user").lean();
  if (!c) return NextResponse.redirect(home);
  if (c.user) return NextResponse.redirect(new URL(`/${locale}/login?next=${encodeURIComponent(`/${locale}/cart`)}`, req.url)); // the account's own bag: sign in and it is there
  if (c.guestId) (await cookies()).set(CART_COOKIE, c.guestId, { httpOnly: true, sameSite: "lax", secure: secureCookie, path: "/", maxAge: 30 * 86400 });
  return NextResponse.redirect(home);
}
