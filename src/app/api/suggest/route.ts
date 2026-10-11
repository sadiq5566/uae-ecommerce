import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { suggest } from "@/features/catalog/service";

export const dynamic = "force-dynamic";

/** Public search-as-you-type. Read-only, bounded (≤6 results, ≥2 chars), rate-limited per IP. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ items: [] });
  if (!(await rateLimit(`suggest:${await clientIp()}`, 120, 60)).ok) return NextResponse.json({ items: [] }, { status: 429 });
  return NextResponse.json({ items: await suggest(q) }, { headers: { "Cache-Control": "no-store" } });
}
