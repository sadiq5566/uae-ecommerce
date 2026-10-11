import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, isLocale, locales } from "@/lib/i18n";

function pickLocale(req: NextRequest) {
  const saved = req.cookies.get("locale")?.value;
  if (saved && isLocale(saved)) return saved;
  const header = req.headers.get("accept-language") ?? "";
  const first = header.split(",")[0]?.trim().slice(0, 2).toLowerCase();
  return first && isLocale(first) ? first : defaultLocale;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return; // admin is English-only and lives outside /[lang]
  const hasLocale = locales.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  if (hasLocale) return;
  req.nextUrl.pathname = `/${pickLocale(req)}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(req.nextUrl);
}

export const config = {
  // Skip Next internals, API routes and files with extensions.
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
