// Brand names, kept apart from categories. `inferBrand` reads the brand off a product name ("Zegna Suede Sneakers" -> "Zegna").

/** Display name -> other spellings found in product names. */
const BRANDS: Record<string, string[]> = {
  Rolex: [], Cartier: [], Hublot: [], Omega: [], Boucheron: [], Chopard: [], "Audemars Piguet": [], "Patek Philippe": [], "Richard Mille": [],
  Tiffany: ["Tiffany & Co"], "Van Cleef & Arpels": ["Van Cleef"], Bulgari: ["Bvlgari"], Messika: [], Swarovski: [], Pandora: [],
  "Louis Vuitton": [], Hermès: ["Hermes"], Chanel: [], Dior: ["Christian Dior"], Gucci: [], Prada: [], "Saint Laurent": ["Yves Saint Laurent", "YSL"],
  Goyard: [], Montblanc: [], Polène: ["Polene"], Balenciaga: [], "Bottega Veneta": [], Celine: ["Céline"], Fendi: [], Givenchy: [], Loewe: [],
  "Miu Miu": [], Burberry: [], Versace: [], Valentino: [], Zegna: ["Ermenegildo Zegna"], "Loro Piana": [], "Tom Ford": [], Berluti: [],
  "Jimmy Choo": [], "Christian Louboutin": ["Louboutin"], "Manolo Blahnik": [], "Salvatore Ferragamo": ["Ferragamo"], "Golden Goose": [], Hogan: [],
  Rimowa: [], "Ray-Ban": [],
};

/** Names a shop uses for itself when a product has no real brand; they count as "no brand". */
const PLACEHOLDER_BRANDS = ["carts heaven", "rimal uae", "rimal", "lune", "amara", "wrist gallery", ""];
export const isPlaceholderBrand = (b?: string | null) => PLACEHOLDER_BRANDS.includes((b ?? "").trim().toLowerCase());

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const matchers = Object.entries(BRANDS).flatMap(([name, aliases]) =>
  [name, ...aliases].map((spelling) => ({ name, re: new RegExp(`(^|[^a-z0-9])${escape(fold(spelling))}($|[^a-z0-9])`) })),
);

/** The brand a product name starts with or mentions (earliest mention wins), or undefined. */
export function inferBrand(name: string): string | undefined {
  const text = fold(name).slice(0, 80);
  let best: { name: string; at: number } | undefined;
  for (const m of matchers) {
    const hit = m.re.exec(text);
    if (hit && (!best || hit.index < best.at)) best = { name: m.name, at: hit.index };
  }
  return best?.name;
}

/** "all-louis-vuitton" -> "Louis Vuitton" for a brand that was saved as a category. Known brands get their proper spelling ("all-herm-s" -> "Hermès"). */
export function brandFromCategorySlug(slug: string): string {
  const plain = slug.replace(/^(all-)+/, "").replace(/-/g, " ");
  return inferBrand(plain.replace(/\bherm s\b/, "hermes")) ?? plain.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** True when a category value is really a brand ("all-louis-vuitton", "Cartier"). Product types such as "bags" or "new-arrivals" are not. */
export const looksLikeBrand = (category: string) => Boolean(inferBrand(category.replace(/^(all-)+/, "").replace(/[-_]+/g, " ").replace(/\bherm s\b/, "hermes")));
