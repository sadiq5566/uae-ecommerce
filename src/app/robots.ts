import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n";

/**
 * Private pages and parameter duplicates stay out of the crawl; ad-click tracking parameters never create new pages (canonical tags cover the rest).
 * Each private section is written per locale and matched exactly (a trailing dollar sign) or as a folder (a trailing slash). A wildcard prefix
 * pattern such as "/<star>/cart" would also block every product whose slug starts with "cart" (for example /en/p/cartier-...).
 */
const SECTIONS = ["account", "cart", "checkout", "wishlist", "search", "login", "register", "forgot-password", "reset-password", "verify-email", "pay", "track"];
const PRIVATE = ["/admin", "/api/", "/avatars/", ...locales.flatMap((l) => SECTIONS.flatMap((s) => [`/${l}/${s}$`, `/${l}/${s}/`, `/${l}/${s}?`]))];
const DUPLICATES = ["/*?*sort=", "/*?*page=", "/*?*utm_", "/*?*fbclid=", "/*?*gclid=", "/*?*ref="];

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...PRIVATE, ...DUPLICATES] }],
    sitemap: [`${base}/sitemap.xml`],
    host: base,
  };
}
