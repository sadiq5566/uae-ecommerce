// Product / category copy for search engines, shared by the CSV importer and scripts/seo-fix.ts. Pure: no DB, no Next.
// It only states what the data holds (name, brand, category) plus the store's own delivery promises, never materials, sizes or authenticity.
import { inferBrand, isPlaceholderBrand } from "./brands";

export const STORE_NAME = process.env.STORE_NAME || "Rayana Collection";

/** Other shops the supplier files were scraped from. Their names must never reach customers or search results. */
const SUPPLIER_NAMES = /\b(?:rimal(?:\s*uae|\.club)?|carts\s*heaven)\b/gi;
export const hasSupplierName = (s?: string | null) => !!s && new RegExp(SUPPLIER_NAMES.source, "i").test(s);
export const stripSupplier = (s: string, store = STORE_NAME) => s.replace(SUPPLIER_NAMES, store);

export const hasArabic = (s: string) => /[؀-ۿ]/.test(s);

/** "Messika (GEN-7B296406)" -> "Messika": drops the internal import code that leaked into some names. */
export const cleanName = (name: string) => stripSupplier(name).replace(/\s*\(GEN-[A-Z0-9-]+\)/gi, "").replace(/\s+/g, " ").trim();
/** Name for titles and sentences: the "Brand | Product" separator becomes a space. */
export const plainName = (name: string) => cleanName(name).replace(/\s*\|\s*/g, " ").replace(/\s+/g, " ").trim();

/** Brand to show: a real brand stays; a supplier-shop name is replaced by the brand read from the product name, else by this store. */
export function resolveBrand(brand: string | undefined | null, name: string): string {
  const b = (brand ?? "").trim();
  if (b && !isPlaceholderBrand(b) && !hasSupplierName(b)) return b;
  return inferBrand(name) ?? STORE_NAME;
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const clip = (s: string, max: number) => {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1), sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:–-]+$/, "") + "…";
};

export type Kind = { noun: string; plural: string; lines: string[] };
const K = (noun: string, plural: string, ...lines: string[]): Kind => ({ noun, plural, lines });

/** What the product is, from its category and the words in its name. */
export function kindOf(category: string, name: string): Kind {
  const n = name.toLowerCase();
  switch (category) {
    case "watches": return K("watch", "watches", "A statement timepiece with a clean dial and a polished finish, easy to wear with kanduras, shirts and evening outfits.", "Made for a sharp wrist presence, it dresses up for dinners and events yet stays comfortable for daily wear.", "A refined watch that works as a statement piece or as part of a cleaner luxury wardrobe.");
    case "jewelry": return K(/\bring\b/.test(n) ? "ring" : /bracelet|bangle/.test(n) ? "bracelet" : /necklace|pendant|choker/.test(n) ? "necklace" : /earring/.test(n) ? "earrings" : "jewelry piece", "jewelry", "A polished piece that lifts everyday outfits and layers easily with the rest of your jewelry.", "Designed to be worn daily or kept for occasions, and a thoughtful choice for gifting.", "Clean lines and a bright finish that pair with both casual and evening looks.");
    case "perfume": return K("fragrance", "fragrances", "A fragrance for customers who want a polished scent with a premium feel, for daily wear or special occasions.", "Presented well for personal use or gifting, a refined addition to any perfume collection.", "A memorable scent profile, suited to day and evening in the UAE.");
    case "bags": {
      const t = /wallet/.test(n) ? "wallet" : /card holder|cardholder/.test(n) ? "card holder" : /pouch|organizer/.test(n) ? "pouch" : /backpack/.test(n) ? "backpack" : /tote/.test(n) ? "tote bag" : "bag";
      return K(t, t === "wallet" || t === "card holder" ? t + "s" : "bags", "A clean silhouette with practical space for daily essentials, easy to style for work, travel and evenings out.", "A versatile piece that completes an outfit with an elevated finish, for everyday carry or gifting.", "Compact and organised, it keeps the essentials close without adding bulk.");
    }
    case "footwear": return K(/sneaker|trainer|runner|cloud/.test(n) ? "sneakers" : "shoes", "shoes", "A comfortable, streamlined pair for everyday wear, travel and smart-casual looks.", "A versatile silhouette that pairs easily with jeans, chinos and relaxed outfits.", "Designed to be worn all day, with styling that works from errands to weekends away.");
    case "glasses": return K("sunglasses", "sunglasses", "Sunglasses with a sharp frame and a refined look, practical for bright UAE days and driving.", "A frame that finishes both casual and dressed-up outfits, with the UV comfort you want in summer.", "A classic eyewear choice that is easy to wear every day.");
    case "caps": return K("cap", "caps", "A cap that adds a branded street-luxury finish to simple outfits without overcomplicating the style.", "Easy to wear daily, with a clean profile that suits casual and sporty looks.", "A versatile everyday cap that pairs with most wardrobes.");
    case "apparel": return K("apparel item", "apparel", "Everyday basics designed for comfort, easy to layer and to wear all day.", "A practical wardrobe staple in a clean, simple design.");
    case "home": return K("home accessory", "home accessories", "A practical piece for the home, travel or the beach, chosen for everyday use and gifting.", "Soft, simple and easy to use, a neat addition to your daily routine.");
    case "belts": return K("belt", "belts", "A belt that finishes the outfit with a clean, polished buckle, suited to jeans, trousers and tailoring.", "Designed for daily wear and gifting, with a refined buckle and a versatile profile.");
    default: return K(/belt/.test(n) ? "belt" : /key/.test(n) ? "key accessory" : /scarf/.test(n) ? "scarf" : "accessory", "accessories", "A finishing touch that adds a premium look to everyday outfits.", "Well suited to daily use and gifting, with a clean, refined design.");
  }
}

const DELIVERY = "Fast delivery across the UAE (Dubai, Abu Dhabi, Sharjah and all emirates)";

export type CopyInput = { sku: string; name: string; brand?: string | null; category: string; colors?: string[] };

/** Title ladder: the longest variant that still fits a Google title (~62 chars). */
function titleFor(name: string, suffixes: string[]) {
  for (const s of suffixes) if ((name + s).length <= 62) return name + s;
  return clip(name, 62);
}

export function productCopy(i: CopyInput) {
  const name = plainName(i.name), brand = resolveBrand(i.brand, i.name), kind = kindOf(i.category, name);
  const ar = hasArabic(name);
  const seoTitle = ar ? titleFor(name, [` | ${STORE_NAME}`]) : titleFor(name, [` | Buy Online in UAE | ${STORE_NAME}`, ` | Buy in UAE | ${STORE_NAME}`, ` | ${STORE_NAME}`, " | Buy in UAE"]);
  const base = `Buy ${name} online in the UAE.`, tail = "Fast delivery in Dubai, Abu Dhabi & Sharjah, cash on delivery.";
  const withLine = `${base} ${kind.lines[hash(i.sku) % kind.lines.length]} ${tail}`;
  const seoDescription = ar
    ? clip(`تسوق ${name} أونلاين في الإمارات من ${STORE_NAME}. توصيل سريع إلى دبي وأبوظبي والشارقة، الدفع عند الاستلام وإرجاع سهل.`, 158)
    : withLine.length <= 158 ? withLine : clip(`${base} ${tail}`, 158);
  if (ar) return { brand, seoTitle, seoDescription };

  const line = kind.lines[hash(i.sku) % kind.lines.length];
  const colors = (i.colors ?? []).filter(Boolean);
  const details = [
    `Brand: ${brand === STORE_NAME ? STORE_NAME : brand}`,
    `Type: ${kind.noun.charAt(0).toUpperCase() + kind.noun.slice(1)}`,
    `Category: ${i.category.charAt(0).toUpperCase() + i.category.slice(1)}`,
    ...(colors.length ? [`Options: ${colors.slice(0, 6).join(", ")}`] : []),
  ];
  const longDescription = [
    `${name}${brand !== STORE_NAME && !name.toLowerCase().includes(brand.toLowerCase()) ? ` by ${brand}` : ""} is available to buy online at ${STORE_NAME}. ${DELIVERY}, with cash on delivery.`,
    "",
    line,
    "",
    "Product details",
    ...details,
    "",
    `Why shop with ${STORE_NAME}?`,
    "Fast delivery across the UAE",
    "Cash on delivery available",
    "Easy returns",
    "Secure, careful packaging",
    "Responsive WhatsApp customer support",
    "",
    "Please review the product images and selected option before ordering. Colours may appear slightly different depending on lighting and screen settings.",
  ].join("\n");
  const shortDescription = clip(`${name}. ${line} Cash on delivery and fast UAE delivery.`, 155);
  return { brand, seoTitle, seoDescription, shortDescription, longDescription };
}

/** The words shoppers search for, per category slug (the slug itself stays "glasses", "home"…). */
export const SEO_LABEL: Record<string, string> = { glasses: "Sunglasses", footwear: "Shoes & Sneakers", home: "Home Accessories", caps: "Caps & Hats", belts: "Designer Belts", bags: "Bags & Wallets", accessories: "Fashion Accessories", apparel: "Men's Underwear" };

/** Category page title/description for search results. `brands` are the biggest brands in it, used as natural keywords. */
export function categoryCopy(label: string, brands: string[], count: number) {
  const top = brands.filter((b) => b && b !== STORE_NAME).slice(0, 3);
  const title = titleFor(`Buy ${label} Online in UAE`, [` | ${STORE_NAME}`]);
  const from = top.length ? ` from ${top.slice(0, -1).join(", ")}${top.length > 1 ? " & " : ""}${top[top.length - 1]}` : "";
  const description = clip(`Shop ${count > 20 ? `${Math.floor(count / 10) * 10}+ ` : ""}${label.toLowerCase()}${from} online in the UAE. Fast delivery in Dubai, Abu Dhabi & Sharjah, cash on delivery, easy returns.`, 158);
  return { title, description, intro: `Shop ${label.toLowerCase()}${from} at ${STORE_NAME}, with fast delivery across the UAE, cash on delivery and easy returns.` };
}
