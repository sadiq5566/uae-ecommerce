import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { collectionsCsv, productsCsv } from "../../../../../lib/product-export";
import { Lead } from "@/models/lead";

export const dynamic = "force-dynamic";
const MAX_EXPORT = 20_000;

/** GET /api/admin/export?type=products|categories|products-template|categories-template — formula-injection-safe CSV (UTF-8 with BOM for Excel/Arabic). */
export async function GET(req: Request) {
  const type = new URL(req.url).searchParams.get("type") ?? "";
  if (type === "leads") {
    // Personal data: owners only, and only people who opted in to marketing.
    const owner = await getCurrentUser();
    if (!owner || !can(owner.role, "users:manage")) return new NextResponse("Forbidden", { status: 403 });
    await connectDb();
    const rows = await Lead.find({ marketingConsent: true, unsubscribedAt: null }).sort({ createdAt: -1 }).limit(MAX_EXPORT).lean();
    const csv = toCsv(["email", "phone", "name", "source", "language", "opted_in_at"], rows.map((l) => [l.email, l.phone, l.name, l.source, l.locale, l.consentAt?.toISOString()]));
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  const kind = type === "collections" || type === "categories" ? "collections" : type === "products" ? "products" : null;
  const user = await getCurrentUser();
  if (!kind || !user || !can(user.role, "products:write")) return new NextResponse("Forbidden", { status: 403 });
  await connectDb();
  const body = kind === "products" ? await productsCsv() : await collectionsCsv();
  return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
