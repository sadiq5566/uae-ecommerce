import type { CsvRow } from "./csv";
import { normText } from "./variants-ar";

/** Internal column the grouper adds to a merged row: the variants as JSON. Never read from a user's file header (it is not a known column). */
export const VARIANTS_FIELD = "variants_json";

const norm = normText; // Unicode-safe (Arabic names) — see lib/variants-ar.ts
const urls = (s?: string) => (s ?? "").split("|").map((x) => x.trim()).filter(Boolean);
const MAX_IMAGES = 12;

/**
 * Supplier files list one row per size (and colour) of the same product. This folds those rows into ONE product row:
 *  - rows belong together when category + brand + name match and each one carries a colour and/or size;
 *  - each row becomes a variant (its own SKU, colour, size, stock; its own price only when it differs; its own image when images differ);
 *  - the product takes the first row's SKU and fields, so re-importing the same file updates the same product.
 * Rows with the same colour + size count once (the first is kept). A group is left unmerged (rows stay separate) only when it has fewer than two different colours / sizes or two rows share a SKU.
 */
export function groupRows(rows: CsvRow[]): CsvRow[] {
  const groups = new Map<string, CsvRow[]>();
  const slots: (CsvRow | string)[] = []; // file order: a plain row, or the key of a group (emitted once)
  for (const r of rows) {
    const d = r.data;
    if (!d.name || !d.sku || !(d.color || d.size) || d[VARIANTS_FIELD]) {
      slots.push(r);
      continue;
    }
    const key = [norm(d.category), norm(d.brand), norm(d.name)].join("|");
    if (!groups.has(key)) slots.push(key);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const out: CsvRow[] = [];
  for (const slot of slots) {
    if (typeof slot !== "string") {
      out.push(slot);
      continue;
    }
    const all = groups.get(slot)!;
    // The same colour + size listed twice (one product uploaded twice in the file) is one variant: keep the first row, so the group still merges
    // into a single product instead of every size becoming its own product.
    const seen = new Set<string>();
    const members = all.filter((m) => { const k = `${norm(m.data.color)}|${norm(m.data.size)}`; if (seen.has(k)) return false; seen.add(k); return true; });
    const skus = new Set(members.map((m) => m.data.sku.toLowerCase()));
    if (members.length < 2 || skus.size < members.length) {
      out.push(...all);
      continue;
    }
    out.push(merge(members));
  }
  return out;
}

function merge(members: CsvRow[]): CsvRow {
  const first = members[0];
  const price = (s?: string) => {
    const n = Number((s ?? "").replace(/aed|,|\s/gi, ""));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const base = price(first.data.price_to);
  const firstImages = urls(first.data.images).join("|");
  const differentImages = members.some((m) => urls(m.data.images).join("|") !== firstImages);

  const variants = members.map((m) => {
    const d = m.data;
    const stock = d.stock ? Number(d.stock.replace(/,/g, "")) : undefined; // empty = keep the product's current stock (see product-import.ts)
    const p = price(d.price_to);
    return {
      sku: d.sku,
      ...(d.color && { color: d.color }),
      ...(d.size && { size: d.size }),
      ...(p != null && p !== base && { price: p }),
      ...(d.stock && { stock: Number.isInteger(stock) && stock! >= 0 ? stock : d.stock }), // an invalid stock is passed through so validation reports it
      ...(differentImages && urls(d.images)[0] && { image: urls(d.images)[0] }),
    };
  });

  const images = [...new Set(members.flatMap((m) => urls(m.data.images)))].slice(0, MAX_IMAGES);
  const { color, ...rest } = first.data;
  delete rest.size;
  delete rest.stock;
  return {
    line: first.line,
    data: { ...rest, ...(rest.finish ? {} : color ? { finish: color } : {}), images: images.join("|"), [VARIANTS_FIELD]: JSON.stringify(variants) },
  };
}
