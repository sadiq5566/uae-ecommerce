import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, isLocale, locales } from "@/lib/i18n";
import slugRedirects from "@/lib/slug-redirects.json";

/** Old product URLs (transliterated Arabic / import codes) -> current URL, as a real 308 so search engines move their ranking. Written by the slug-rename migration. */
const moved = slugRedirects as Record<string, string>;

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
  const old = /^\/(en|ar)\/p\/([^/]+)\/?$/.exec(pathname);
  if (old && moved[old[2]]) { const url = req.nextUrl.clone(); url.pathname = `/${old[1]}/p/${moved[old[2]]}`; return NextResponse.redirect(url, 308); }
  const hasLocale = locales.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  // A friend's invite link (?ref=CODE): remember it for 30 days so it still counts at checkout. A bad value is ignored.
  const ref = req.nextUrl.searchParams.get("ref");
  const refCookie = ref && /^[A-Z0-9-]{4,16}$/i.test(ref) ? ref.toUpperCase() : null;
  const withRef = (res: NextResponse) => { if (refCookie) res.cookies.set("ref", refCookie, { path: "/", maxAge: 30 * 86400, sameSite: "lax", httpOnly: true }); return res; };
  if (hasLocale) return refCookie ? withRef(NextResponse.next()) : undefined;
  req.nextUrl.pathname = `/${pickLocale(req)}${pathname === "/" ? "" : pathname}`;
  return withRef(NextResponse.redirect(req.nextUrl));
}

export const config = {
  // Skip Next internals, API routes and files with extensions.
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
