import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { CATEGORY_TEMPLATE_HEADERS } from "@/features/admin/csv/categories";
import { PRODUCT_TEMPLATE_HEADERS } from "@/features/admin/csv/products";
import { Category } from "@/models/category";
import { Lead } from "@/models/lead";
import { Product } from "@/models/product";

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
  const kind = type.startsWith("categories") ? "categories" : type.startsWith("products") ? "products" : null;
  const user = await getCurrentUser();
  if (!kind || !user || !can(user.role, kind === "products" ? "products:write" : "categories:write")) return new NextResponse("Forbidden", { status: 403 });
  let body: string;
  if (type.endsWith("-template")) {
    body = kind === "products"
      ? toCsv(PRODUCT_TEMPLATE_HEADERS, [["EX-1001", "example-product", "Example product", "منتج مثال", "English description", "وصف عربي", "electronics", "Acme", 199.9, 149.9, 25, "In Stock", 5, "draft", false, "new|gift", "", "color:Black", "Black~EX-1001-BLK~10~~https://cdn.example.com/black.png|Red~EX-1001-RED~15"]])
      : toCsv(CATEGORY_TEMPLATE_HEADERS, [["example-category", "", "Example", "مثال", "English description", "وصف عربي", "🛍️", 0, true, "color:Colour/اللون|size:Size/المقاس"]]);
  } else if (kind === "products") {
    await connectDb();
    const [cats, rows] = await Promise.all([Category.find({}, { slug: 1 }).lean(), Product.find().sort({ sku: 1 }).limit(MAX_EXPORT).lean()]);
    const slugOf = new Map(cats.map((c) => [String(c._id), c.slug]));
    body = toCsv(PRODUCT_TEMPLATE_HEADERS, rows.map((p) => [p.sku, p.slug, p.name?.en, p.name?.ar, p.description?.en, p.description?.ar, slugOf.get(String(p.category)), p.brand, p.price, p.salePrice, p.stock, p.stock > 0 ? "In Stock" : "Out of Stock", p.lowStockThreshold, p.status, p.featured, (p.tags ?? []).join("|"), (p.images ?? []).map((i) => i.url).join("|"), Object.entries((p.attrs ?? {}) as unknown as Record<string, string>).map(([k, v]) => `${k}:${v}`).join("|"), (p.variants ?? []).map((v) => [v.label?.en, v.sku, v.stock, v.price ?? "", v.image ?? ""].join("~")).join("|")]));
  } else {
    await connectDb();
    const cats = await Category.find().sort({ order: 1 }).lean();
    const slugOf = new Map(cats.map((c) => [String(c._id), c.slug]));
    body = toCsv(CATEGORY_TEMPLATE_HEADERS, cats.map((c) => [c.slug, c.parent ? slugOf.get(String(c.parent)) : "", c.name?.en, c.name?.ar, c.description?.en, c.description?.ar, c.icon, c.order, c.active, (c.attributes ?? []).map((a) => `${a.key}:${a.label?.en}/${a.label?.ar}`).join("|")]));
  }
  return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
