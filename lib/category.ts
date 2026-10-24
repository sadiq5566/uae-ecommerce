import { slugify } from "./utils";

/** Keyword -> canonical category. Order matters: the first match wins. */
const HINTS: [string, RegExp][] = [
  ["perfume", /\b(perfumes?|fragrances?|parfum|eau de|cologne|oud|\d+\s?ml)\b/i],
  ["watches", /\b(watch|watches|chronograph|smartwatch)\b/i],
  ["jewelry", /\b(jewel(l)?ery|rings?|necklaces?|earrings?|bracelets?|bangles?|pendants?|anklets?|brooch(es)?|chokers?|messika)\b/i],
  ["bags", /\b(bags?|handbags?|totes?|clutch(es)?|backpacks?|wallets?|purses?|satchels?|hobo|birkin|kelly|flap|evelyne|capucines|onthego|crossbody|cross body|shoulder)\b/i],
  ["accessories", /\b(keychains?|key chains?|scarf|scarves|sunglasses|belts?)\b/i],
];

export const guessCategory = (text: string): string | undefined => HINTS.find(([, re]) => re.test(text))?.[0];

/**
 * Category for a CSV row / product. An explicit category is folded into a canonical one when it clearly means it
 * ("shoulder-bags" -> bags), otherwise kept as its own slug. With no category the name, subcategory and tags decide, else "general".
 */
export function resolveCategory(raw: string | undefined, hint = ""): string {
  const cleaned = (raw ?? "").trim().toLowerCase().replace(/[-_]+/g, " ");
  if (cleaned) return guessCategory(cleaned) ?? slugify(cleaned);
  return guessCategory(hint) ?? "general";
}
