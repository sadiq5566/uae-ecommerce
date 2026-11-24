import { getBrand } from "@/lib/email";
import { getCategories, getCollection } from "@/features/catalog/service";
import { publishedPageSlugs } from "@/features/content/service";
import { getPublicOffers } from "@/features/offers/service";

export const revalidate = 3600;

/**
 * /llms.txt: a plain-text map of the store for AI assistants and answer engines (ChatGPT, Gemini, Perplexity, Claude). It states only facts the shop's
 * own settings and catalogue hold, and links the pages worth reading: categories, policy pages and best sellers (each product page carries its FAQ).
 */
export async function GET() {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const [brand, offers] = await Promise.all([getBrand("en"), getPublicOffers()]);
  const [cats, pages, popular] = await Promise.all([getCategories().catch(() => []), publishedPageSlugs().catch(() => [] as string[]), getCollection("popular", 24).catch(() => [])]);
  const lines = [
    `# ${brand.name}`,
    "",
    `> ${brand.name} is an online store in the United Arab Emirates (UAE)${cats.length ? ` selling ${cats.slice(0, 8).map((c) => c.name.en.toLowerCase()).join(", ")}` : ""}. We deliver to Dubai, Abu Dhabi, Sharjah, Ajman and all seven emirates. Prices are in AED. The site is available in English and Arabic.`,
    "",
    "## Shopping facts",
    `- Delivery: all seven emirates${offers.freeDelivery.enabled ? (offers.freeDelivery.all ? ", free delivery" : offers.freeDelivery.min > 0 ? `, free delivery over AED ${offers.freeDelivery.min}` : "") : ""}`,
    `- Payment: ${offers.cod ? "cash on delivery and online card payment" : "online card payment"}`,
    ...(offers.returnDays > 0 ? [`- Returns: request within ${offers.returnDays} days of delivery`] : []),
    `- Languages: English (${base}/en) and Arabic (${base}/ar)`,
    "",
    "## Categories",
    ...cats.map((c) => `- [${c.name.en}](${base}/en/c/${c.slug})${c.description?.en ? `: ${c.description.en.replace(/\s+/g, " ").slice(0, 140)}` : ""}`),
    "",
    "## Information",
    ...pages.map((s) => `- [${s.replace(/-/g, " ")}](${base}/en/${s})`),
    `- [Journal](${base}/en/journal)`,
    "",
    "## Popular products (each page has specs and a product FAQ)",
    ...popular.map((p) => `- [${p.name.en}](${base}/en/p/${p.slug}): AED ${p.finalPrice}${p.brand ? `, ${p.brand}` : ""}`),
    "",
    "## Optional",
    `- [Sitemap](${base}/sitemap.xml)`,
  ];
  return new Response(lines.join("\n") + "\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
