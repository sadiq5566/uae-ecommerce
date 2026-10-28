import { connectDb } from "@/lib/db";
import { Product } from "@/models/product";
import { absolute, siteUrl } from "@/lib/email";
import { getCategories } from "@/features/catalog/service";

/**
 * Google Merchant Center product feed (free product listings + Shopping ads). In Merchant Center: Products > Feeds > add
 * a scheduled fetch of https://<site>/feed/google.xml. Prices are AED; shipping/returns are set in Merchant Center settings.
 */
export const revalidate = 3600;

const esc = (s: unknown) => String(s ?? "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
const clean = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export async function GET() {
  await connectDb();
  const [products, cats] = await Promise.all([
    Product.find({ status: "active", mergedInto: null }).sort({ updatedAt: -1 }).limit(40000).lean(),
    getCategories(),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name.en]));
  const base = siteUrl();
  const items = products.filter((p) => p.images?.[0]?.url && (p.priceTo ?? 0) > 0).map((p) => {
    const price = Math.max(p.priceFrom ?? 0, p.priceTo ?? 0), sale = p.priceTo ?? price;
    const desc = clean(p.longDescription || p.shortDescription || p.name).slice(0, 4900);
    return [
      "<item>",
      `<g:id>${esc(p.sku)}</g:id>`, `<g:title>${esc(p.name.slice(0, 150))}</g:title>`, `<g:description>${esc(desc)}</g:description>`,
      `<g:link>${esc(`${base}/en/p/${p.slug}`)}</g:link>`, `<g:image_link>${esc(absolute(p.images[0].url))}</g:image_link>`,
      ...p.images.slice(1, 10).map((i) => `<g:additional_image_link>${esc(absolute(i.url))}</g:additional_image_link>`),
      `<g:availability>${p.stock > 0 ? "in_stock" : "out_of_stock"}</g:availability>`,
      `<g:price>${price.toFixed(2)} AED</g:price>`, ...(sale < price ? [`<g:sale_price>${sale.toFixed(2)} AED</g:sale_price>`] : []),
      "<g:condition>new</g:condition>",
      ...(p.brand ? [`<g:brand>${esc(p.brand)}</g:brand>`] : []),
      ...(p.model ? [`<g:mpn>${esc(p.model)}</g:mpn>`] : []),
      ...(!p.brand || !p.model ? ["<g:identifier_exists>no</g:identifier_exists>"] : []),
      ...(catName.get(String(p.category)) ? [`<g:product_type>${esc(catName.get(String(p.category)))}</g:product_type>`] : []),
      "</item>",
    ].join("");
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>${esc(base)}</title><link>${esc(base)}</link><description>Product feed</description>${items.join("")}</channel></rss>`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
