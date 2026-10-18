// Small, dependency-free CSV toolkit (RFC 4180). Pure functions, safe to use on server and client.
// SECURITY: parsing only ever yields strings — nothing is evaluated. Exports neutralise spreadsheet formulas (CSV injection).

export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_CSV_ROWS = 5000;

export type ParsedCsv = { headers: string[]; rows: string[][]; error?: string };

export function parseCsv(input: string, opts: { maxRows?: number } = {}): ParsedCsv {
  const maxRows = opts.maxRows ?? MAX_CSV_ROWS;
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input; // strip BOM
  if (text.includes("\u0000")) return { headers: [], rows: [], error: "File looks binary, not CSV" };
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false, i = 0, started = false;
  const endField = () => { row.push(field); field = ""; started = false; };
  const endRow = () => { endField(); if (!(row.length === 1 && row[0] === "")) rows.push(row); row = []; };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQuotes = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"' && !started && field === "") { inQuotes = true; started = true; i++; continue; }
    if (c === ",") { endField(); i++; continue; }
    if (c === "\r") { if (text[i + 1] === "\n") i++; endRow(); i++; if (rows.length > maxRows + 1) break; continue; }
    if (c === "\n") { endRow(); i++; if (rows.length > maxRows + 1) break; continue; }
    field += c; started = true; i++;
  }
  if (inQuotes) return { headers: [], rows: [], error: "Unterminated quoted field — the file is malformed" };
  if (field !== "" || row.length) endRow();
  if (rows.length === 0) return { headers: [], rows: [], error: "The file is empty" };
  const headers = rows[0].map((h) => h.trim());
  const data = rows.slice(1);
  if (data.length > maxRows) return { headers, rows: [], error: `Too many rows (max ${maxRows}). Split the file.` };
  return { headers, rows: data };
}

/** Flatten one JSON value to the same string form a CSV cell would hold (arrays → a|b, objects → k:v|k:v). */
function jsonCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" && "url" in x ? String((x as { url: unknown }).url) : jsonCell(x))).join("|");
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}:${jsonCell(x)}`).join("|");
  return String(v);
}

const VARIANT_KEYS = new Set(["variants"]);
/** [{label|name|color, sku, stock|quantity, price, image}] → "Label~SKU~stock~price~image|…" (the CSV variants format). Plain strings are labels. */
function variantsCell(v: unknown): string | null {
  if (!Array.isArray(v)) return null;
  return v.map((x) => {
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      return [o.label ?? o.name ?? o.color ?? o.colour, o.sku, o.stock ?? o.quantity, o.price, o.image ?? o.image_url].map((f) => (f == null ? "" : String(f))).join("~").replace(/~+$/, "");
    }
    return String(x);
  }).join("|");
}

/** JSON Lines: one flat-or-simple JSON object per line. Yields the same shape as parseCsv; "line" numbers are record numbers (blank lines skipped). */
export function parseJsonl(input: string, opts: { maxRows?: number } = {}): ParsedCsv {
  const maxRows = opts.maxRows ?? MAX_CSV_ROWS;
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (text.includes("\u0000")) return { headers: [], rows: [], error: "File looks binary, not JSONL" };
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [], error: "The file is empty" };
  if (lines.length > maxRows) return { headers: [], rows: [], error: `Too many rows (max ${maxRows}). Split the file.` };
  const objs: Record<string, unknown>[] = [];
  for (let i = 0; i < lines.length; i++) {
    let o: unknown;
    try { o = JSON.parse(lines[i]); } catch { return { headers: [], rows: [], error: `Record ${i + 1} is not valid JSON` }; }
    if (!o || typeof o !== "object" || Array.isArray(o)) return { headers: [], rows: [], error: `Record ${i + 1} must be a JSON object` };
    objs.push(o as Record<string, unknown>);
  }
  const headers = [...new Set(objs.flatMap((o) => Object.keys(o)))];
  return { headers, rows: objs.map((o) => headers.map((h) => (VARIANT_KEYS.has(h.toLowerCase()) ? variantsCell(o[h]) : null) ?? jsonCell(o[h]))) };
}

/** Cells starting with these characters are interpreted as formulas by spreadsheet apps. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** Serialise one cell. Numbers/booleans are written as-is; text that could be a formula gets a leading apostrophe. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "true" : "false";
  let s = String(v);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (headers: string[], rows: unknown[][]) => "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

/** Map file rows to objects using canonical column names; unknown columns are reported, not silently used. */
export function mapColumns(headers: string[], aliases: Record<string, string[]>) {
  const canon = new Map<string, string>();
  for (const [name, alts] of Object.entries(aliases)) for (const a of [name, ...alts]) canon.set(a.toLowerCase().replace(/[\s-]+/g, "_"), name);
  const index: Record<string, number> = {}; const unknown: string[] = []; const dupes: string[] = []; const alt: Record<string, number[]> = {};
  headers.forEach((h, i) => {
    const key = canon.get(h.toLowerCase().replace(/[\s-]+/g, "_"));
    if (!key) { if (h) unknown.push(h); return; }
    if (key in index) { dupes.push(h); (alt[key] ??= []).push(i); } else index[key] = i;
  });
  return { index, alt, unknown, dupes, present: new Set(Object.keys(index)) };
}

/** `alt` = further columns that map to the same field (e.g. both "category" and "category_slug"): the first non-empty cell wins. */
export function rowObject(row: string[], index: Record<string, number>, alt: Record<string, number[]> = {}): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, i] of Object.entries(index)) o[k] = [i, ...(alt[k] ?? [])].map((j) => (row[j] ?? "").trim()).find(Boolean) ?? "";
  return o;
}
