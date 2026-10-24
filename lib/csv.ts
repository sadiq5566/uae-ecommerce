/** Client-safe CSV helpers (no Node/Mongo imports): parser with header aliases, and a writer with a formula-injection guard. */

export type CsvRow = { line: number; data: Record<string, string> };
export type ParsedCsv = { headers: string[]; rows: CsvRow[]; unknown: string[]; error?: string };

/** Canonical column -> accepted header spellings (compared after normalising case, spaces and dashes). */
export const PRODUCT_COLUMNS: Record<string, string[]> = {
  sku: ["sku", "product_sku", "code", "item_code"],
  name: ["name", "title", "product_name", "name_en"],
  slug: ["slug", "handle"],
  category: ["category", "type", "category_slug"],
  subcategory: ["subcategory", "sub_category", "product_type"],
  brand: ["brand", "vendor"],
  model: ["model"],
  color: ["color", "colour"],
  size: ["size", "sizes", "option_size"],
  finish: ["finish", "material"],
  price_from: ["price_from", "compare_at_price", "old_price", "original_price", "mrp", "regular_price"],
  price_to: ["price_to", "price", "selling_price", "sale_price"],
  currency: ["currency"],
  short_description: ["short_description", "summary"],
  long_description: ["long_description", "description", "description_en", "body", "body_html"],
  included_items: ["included_items", "included", "whats_included"],
  images: ["images", "image", "image_urls", "image_url", "image_src"],
  stock: ["stock", "quantity", "qty", "inventory"],
  status: ["status"],
  tags: ["tags", "tag"],
  highlights: ["highlights", "features"],
  is_new: ["is_new", "new", "new_arrival"],
  is_featured: ["is_featured", "featured"],
  is_most_wanted: ["is_most_wanted", "most_wanted"],
};

export const PRODUCT_TEMPLATE_HEADERS = [
  "sku", "name", "slug", "category", "subcategory", "brand", "model", "color", "finish", "price_from", "price_to", "currency",
  "short_description", "long_description", "included_items", "images", "stock", "status", "tags",
];

const normHeader = (h: string) => h.replace(/^﻿/, "").trim().toLowerCase().replace(/[\s-]+/g, "_");

const ALIAS = new Map<string, string>();
for (const [canon, aliases] of Object.entries(PRODUCT_COLUMNS)) for (const a of aliases) if (!ALIAS.has(a)) ALIAS.set(a, canon);

function detectDelimiter(firstLine: string) {
  const count = (d: string) => firstLine.split(d).length;
  return [",", ";", "\t"].reduce((best, d) => (count(d) > count(best) ? d : best), ",");
}

/** RFC 4180 tokenizer: quoted fields, escaped quotes, CRLF/LF, embedded newlines. Keeps the 1-based file line of each record. */
function tokenize(text: string, delim: string) {
  const out: { line: number; cells: string[] }[] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let startLine = 1;
  const src = text.replace(/^﻿/, "");
  const flush = () => {
    row.push(field);
    field = "";
    if (row.some((x) => x.trim() !== "")) out.push({ line: startLine, cells: row });
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else {
        if (c === "\n") line++;
        field += c;
      }
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      flush();
      line++;
      startLine = line;
    } else field += c;
  }
  if (quoted) return { rows: out, unterminated: true };
  flush();
  return { rows: out, unterminated: false };
}

/** Parses product CSV text. Headers are mapped to canonical names through aliases; unknown/duplicate columns are reported. */
export function parseCsv(text: string): ParsedCsv {
  if (text.includes("\u0000")) return { headers: [], rows: [], unknown: [], error: "This does not look like a text CSV file." };
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const { rows: raw, unterminated } = tokenize(text, detectDelimiter(firstLine));
  if (unterminated) return { headers: [], rows: [], unknown: [], error: "A quoted value is never closed (missing closing quote)." };
  if (raw.length < 2) return { headers: [], rows: [], unknown: [], error: "No data rows found. The first line must be the header row." };

  const unknown: string[] = [];
  const headers = raw[0].cells.map((h) => {
    const n = normHeader(h);
    const canon = ALIAS.get(n);
    if (!canon && n) unknown.push(h.trim());
    return canon ?? "";
  });

  const rows = raw.slice(1).map(({ line, cells }) => {
    const data: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (!h) return;
      const v = (cells[i] ?? "").trim();
      // If two columns map to the same field, the first non-empty cell wins.
      if (v && !data[h]) data[h] = v;
      else if (!(h in data)) data[h] = "";
    });
    return { line, data };
  });
  return { headers: [...new Set(headers.filter(Boolean))], rows, unknown: [...new Set(unknown)] };
}

/** Neutralises spreadsheet formulas (= + - @ TAB CR) so exported cells are never executed by Excel. */
export const csvCell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Writes CSV with a UTF-8 BOM so Excel opens Arabic text correctly. */
export const toCsv = (headers: string[], rows: unknown[][]) => "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
