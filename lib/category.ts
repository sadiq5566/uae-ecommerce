import { slugify } from "./utils";

/** Keyword -> canonical category. Order matters: the first match wins. Arabic words have no \b (it only understands ASCII word characters). */
const HINTS: [string, RegExp][] = [
  ["perfume", /\b(perfumes?|fragrances?|parfum|eau de|cologne|oud|\d+\s?ml)\b|عطر|عطور|برفان|كولونيا|bois d'argent|lucky paris|spell on you|abcdior|christian paris/i],
  ["watches", /\b(watch|watches|chronograph|smartwatch)\b|ساعة|ساعات/i],
  ["jewelry", /\b(jewel(l)?ery|rings?|necklaces?|earrings?|bracelets?|bangles?|pendants?|anklets?|brooch(es)?|chokers?|messika)\b|خاتم|خواتم|سوار|أسورة|قلادة|أقراط|حلق/i],
  ["glasses", /\b(sunglasses|glasses|eyewear|eyeglasses|spectacles?)\b|\bCT\d{4}[A-Z]{1,2}\b|نظارة|نظارات/i],
  ["caps", /\b(caps?|hats?|beanies?)\b|قبعة|قبعات|كاب/i],
  ["footwear", /\b(footwear|shoes?|sneakers?|trainers?|loafers?|sandals?|slippers?|heels?|boots?|mules?|espadrilles?|moccasins?|slingbacks?)\b|\bon cloud\b|\bcloud(boom|nova|tilt|solo|horizon|monster|surfer|swift|runner|vista|ultra|x)\w*|حذاء|أحذية|احذية|سنيكرز|صندل|صنادل|إسبادريل|اسبادريل/i],
  ["bags", /\b(bags?|handbags?|totes?|clutch(es)?|backpacks?|wallets?|purses?|satchels?|hobo|birkin|kelly|flap|evelyne|capucines|onthego|crossbody|cross body|shoulder|pouch(es)?|card ?holders?|organizers?)\b|constance|saint louis|sac de jour|cyme|times square|حقيبة|حقائب|شنطة|محفظة|حامل بطاقات|باوتش|منظم الجيب/i],
  ["apparel", /\b(boxers?|briefs?|underwear|\d-pack|t-?shirts?|hoodies?)\b|بوكسر|سراويل/i],
  ["home", /\b(towels?|microfiber|decor|cushions?|blankets?|candles?)\b/i],
  ["belts", /\bbelts?\b|حزام|أحزمة/i],
  ["accessories", /\b(keychains?|key chains?|scarf|scarves)\b/i],
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
