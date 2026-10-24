// Cart, checkout and wishlist read products in a { name: {en,ar}, price, finalPrice, variants[].label } shape.
// The shared flat catalogue (lib/models/Product.ts) stores name / priceFrom / priceTo / variants colour+size, so convert at the boundary.
import { swatchFor } from "../../../lib/variants";

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const variantLabel = (v: { color?: string; size?: string; sku: string } | Doc) => [v.color, v.size].filter(Boolean).join(" / ") || v.sku;

export function toRow(d: Doc) {
  const price = Math.max(d.priceFrom ?? 0, d.priceTo ?? 0);
  return {
    ...d,
    name: { en: d.name, ar: d.name },
    price, finalPrice: d.priceTo,
    icon: "📦", hue: 160,
    category: String(d.category),
    description: { en: d.longDescription ?? "", ar: d.longDescription ?? "" },
    variants: (d.variants ?? []).map((v: Doc) => ({ ...v, label: { en: variantLabel(v), ar: variantLabel(v) }, price: v.price ?? d.priceTo, swatch: v.color ? swatchFor(v.color) : undefined })),
  };
}
