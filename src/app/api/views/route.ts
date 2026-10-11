import { NextResponse, type NextRequest } from "next/server";
import { incrementView } from "@/features/catalog/service";

const BOT = /bot|crawl|spider|slurp|preview|headless|curl|wget/i;
const COOKIE = "pv";
const MAX_IDS = 40;

/**
 * Counts a product view at most once per browser per product (cookie-deduped, 30-min window).
 * Bots are ignored. No IPs or user identifiers are stored — only a counter on the product.
 */
export async function POST(req: NextRequest) {
  if (BOT.test(req.headers.get("user-agent") ?? "")) return new NextResponse(null, { status: 204 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const seen = (req.cookies.get(COOKIE)?.value ?? "").split(".").filter(Boolean);
  const res = new NextResponse(null, { status: 204 });
  if (seen.includes(id)) return res;
  await incrementView(id);
  res.cookies.set(COOKIE, [id, ...seen].slice(0, MAX_IDS).join("."), { maxAge: 1800, httpOnly: true, sameSite: "lax", path: "/api/views" });
  return res;
}
