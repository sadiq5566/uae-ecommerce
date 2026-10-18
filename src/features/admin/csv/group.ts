import { baseName } from "@/lib/variant-name";

type Row = { line: number; data: Record<string, string> };
const clean = (s: string) => s.replace(/[~|]/g, " ").trim();

/**
 * Shop exports (Shopify-style) list each colour/size as its own row with the same product name.
 * Rows that share name (minus the colour/size suffix), category and brand and carry a `color`/`size` are merged into ONE product
 * with a variant per row: variant SKU = the row SKU, label = "Colour / Size", picture = the row's first image.
 * The product SKU is `<first row SKU>-P`. Groups of one row, and rows without colour/size, are left untouched.
 */
export function groupVariantRows(rows: Row[]): { rows: Row[]; merged: number } {
  const keyOf = (r: Row) => {
    const d = r.data; const opts = [d.color, d.size].filter(Boolean);
    if (d.group) return `group:${d.group.toLowerCase()}`; // scraper-provided product id wins over name matching
    return `${baseName(d.name_en ?? "", opts).toLowerCase()}|${(d.category_slug ?? "").toLowerCase()}|${(d.brand ?? "").toLowerCase()}`;
  };
  const eligible = (r: Row) => !!(r.data.color || r.data.size) && !r.data.variants && !!r.data.sku && !!r.data.name_en;
  const groups = new Map<string, Row[]>();
  for (const r of rows) if (eligible(r)) groups.set(keyOf(r), [...(groups.get(keyOf(r)) ?? []), r]);

  const out: Row[] = []; let merged = 0; const done = new Set<string>();
  for (const r of rows) {
    const k = eligible(r) ? keyOf(r) : null;
    const g = k ? groups.get(k)! : null;
    if (!k || !g || g.length < 2) { out.push(r); continue; }
    if (done.has(k)) continue; // already emitted with its group's first row
    done.add(k); merged += g.length;
    const first = g[0].data;
    const variants = g.map((m) => [clean([m.data.color, m.data.size].filter(Boolean).join(" / ")), m.data.sku.toUpperCase(), m.data.stock ?? "", "", (m.data.image_urls ?? "").split("|")[0].trim()].join("~").replace(/~+$/, "")).join("|");
    const images = [...new Set(g.flatMap((m) => (m.data.image_urls ?? "").split("|").map((u) => u.trim()).filter(Boolean)))].slice(0, 10).join("|");
    out.push({
      line: g[0].line,
      data: { ...first, sku: `${first.sku.toUpperCase()}-P`, name_en: baseName(first.name_en, [first.color, first.size].filter(Boolean)), image_urls: images, variants, stock: "" },
    });
  }
  return { rows: out, merged };
}
