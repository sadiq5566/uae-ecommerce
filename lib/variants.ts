// Shared by all storefronts: colour / size options of a product and the heuristics that merge scraped one-product-per-colour/size rows.
export type Variant = { sku: string; color?: string; size?: string; price?: number; stock: number; image?: string };

/** Colour name -> CSS background. Unknown names fall back to grey so a swatch is always drawn (the name is shown next to it). */
export const COLOR_HEX: Record<string, string> = {
  black: "#1c1a17", white: "#ffffff", ivory: "#f6f1e4", cream: "#f3ead7", beige: "#d9c8a9", brown: "#7a5236", tan: "#b58b5a", camel: "#c19a6b", khaki: "#a89b6d",
  grey: "#8c8c8c", gray: "#8c8c8c", silver: "#c4c6c9", gold: "#c9a24f", "rose gold": "#d9a79a", bronze: "#a97142", copper: "#b87333", "two-tone": "linear-gradient(135deg,#c9a24f 50%,#c4c6c9 50%)",
  red: "#c0392b", burgundy: "#6d1f2b", maroon: "#6d1f2b", pink: "#e8b4c0", fuchsia: "#c2185b", purple: "#6c4a8a", lilac: "#c8a2c8", lavender: "#b6a4d4",
  blue: "#5b7fa6", navy: "#1f2a44", "light blue": "#a9c7e6", turquoise: "#3fb8af", teal: "#2a7f7f", green: "#4f7a5d", olive: "#6b7a3a", mint: "#a8d5ba",
  yellow: "#e6c84a", orange: "#e0813a", mustard: "#c99a2e", multi: "linear-gradient(135deg,#c0392b,#e6c84a,#4f7a5d,#5b7fa6)", multicolor: "linear-gradient(135deg,#c0392b,#e6c84a,#4f7a5d,#5b7fa6)",
};
export const swatchFor = (name?: string) => COLOR_HEX[(name ?? "").trim().toLowerCase()] ?? "#cccccc";

const num = (s: string) => parseFloat(s.replace(/[^\d.]/g, ""));
/** Sizes sort numerically when they are numbers (38 < 40 < 42), otherwise by the usual clothing order. */
const ORDER = ["xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl", "one size", "free size"];
export const sortSizes = (a: string, b: string) => {
  const na = num(a), nb = num(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  const ia = ORDER.indexOf(a.toLowerCase()), ib = ORDER.indexOf(b.toLowerCase());
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
};

export function variantOptions(variants: Variant[]) {
  const colors = [...new Set(variants.map((v) => v.color).filter((c): c is string => !!c))];
  const sizes = [...new Set(variants.map((v) => v.size).filter((s): s is string => !!s))].sort(sortSizes);
  return { colors, sizes };
}

/** Exact colour+size match, else the first variant of that colour, else of that size. */
export function pickVariant(variants: Variant[], color?: string, size?: string) {
  return variants.find((v) => (!color || v.color === color) && (!size || v.size === size)) ?? variants.find((v) => v.color === color) ?? variants.find((v) => v.size === size) ?? variants[0];
}
/** Is there stock for this colour (any size) / this size (given the chosen colour)? Used to grey out options. */
export const colorInStock = (variants: Variant[], color: string) => variants.some((v) => v.color === color && v.stock > 0);
export const sizeInStock = (variants: Variant[], size: string, color?: string) => variants.some((v) => v.size === size && (!color || v.color === color) && v.stock > 0);

// ---- merging scraped products ---------------------------------------------------------------------------------------------
const COLOR_WORDS = Object.keys(COLOR_HEX).filter((c) => !c.includes("-")).sort((a, b) => b.length - a.length);
const COLOR_RE = new RegExp(`\\b(${COLOR_WORDS.map((c) => c.replace(/ /g, "\\s+")).join("|")})\\b`, "gi");
const SIZE_TOKEN = "(\\d{1,3}(?:\\.\\d)?|xxs|xs|s|m|l|xl|xxl|xxxl)";
// a trailing size: "Size 38", "- 38", "36mm" / "36 mm" (a bare trailing number is NOT a size: it may be a model number)
const SIZE_RES = [
  new RegExp(`\\b(?:size|sz)\\s*[:\\-]?\\s*${SIZE_TOKEN}\\s*$`, "i"),
  new RegExp(`\\s[-–|/]\\s*${SIZE_TOKEN}(?:\\s*(?:mm|cm))?\\s*$`, "i"),
  /(?:^|\s)(\d{2,3}(?:\.\d)?)\s*(?:mm|cm)\s*$/i,
];
const COLOR_TAIL = new RegExp(`(?:\\s[-–|/(]\\s*|\\s+)(${COLOR_WORDS.map((c) => c.replace(/ /g, "\\s+")).join("|")})\\)?\\s*$`, "i");

/** Splits "Royal Oak Mini - Black - 36mm" into its base name and the colour / size it carries (trailing parts, in either order). */
export function splitName(name: string): { base: string; color?: string; size?: string } {
  let base = name.replace(/\s+/g, " ").trim();
  let color: string | undefined;
  let size: string | undefined;
  for (let i = 0; i < 3; i++) {
    let hit = false;
    if (!size) for (const re of SIZE_RES) { const m = base.match(re); if (m) { size = m[1].toUpperCase().replace(/\.0$/, ""); base = base.slice(0, m.index).trim(); hit = true; break; } }
    if (!color) { const m = base.match(COLOR_TAIL); if (m) { color = m[1].toLowerCase().replace(/\s+/g, " "); base = base.slice(0, m.index).trim(); hit = true; } }
    if (!hit) break;
  }
  return { base: base.replace(/[-–|/(\s]+$/, "").trim(), color, size };
}
export const groupKey = (brand: string | undefined, base: string) => `${(brand ?? "").toLowerCase()}|${base.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
export { COLOR_RE };
