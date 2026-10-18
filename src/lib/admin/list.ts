// Shared helpers for admin list pages: read filters/sort/paging from the URL (never trusting it) and build links back.
import { escapeRe } from "./common";

export type SP = Record<string, string | string[] | undefined>;
export const PAGE_SIZES = [10, 25, 50, 100] as const;

export const str = (sp: SP, k: string, max = 80) => (typeof sp[k] === "string" ? (sp[k] as string).trim().slice(0, max) : "");
export const oneOf = (v: string, ok: readonly string[]) => (ok.includes(v) ? v : "");
export const rx = (q: string) => new RegExp(escapeRe(q), "i");
export const num = (sp: SP, k: string) => { const v = str(sp, k, 20); return /^\d+(\.\d+)?$/.test(v) ? v : ""; };
export const day = (sp: SP, k: string) => { const v = str(sp, k, 10); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ""; };

/** { $gte, $lte } for a from/to pair of YYYY-MM-DD dates in Dubai time (UTC+4); undefined when both are empty. */
export function dayRange(from: string, to: string): { $gte?: Date; $lte?: Date } | undefined {
  const r: { $gte?: Date; $lte?: Date } = {};
  if (from) r.$gte = new Date(`${from}T00:00:00+04:00`);
  if (to) r.$lte = new Date(`${to}T23:59:59.999+04:00`);
  return from || to ? r : undefined;
}

export function parseSort<T extends string>(sp: SP, allowed: readonly T[], def: T, defDir: "asc" | "desc" = "desc") {
  const sort = (allowed as readonly string[]).includes(str(sp, "sort")) ? (str(sp, "sort") as T) : def;
  const dir = str(sp, "dir") === "asc" ? "asc" : str(sp, "dir") === "desc" ? "desc" : sort === def ? defDir : "asc";
  return { sort, dir: dir as "asc" | "desc", mongo: dir === "asc" ? (1 as const) : (-1 as const) };
}
export const parsePage = (sp: SP) => Math.max(1, Math.min(100000, Number(str(sp, "page", 8)) || 1));
export const parseSize = (sp: SP, def = 25) => { const n = Number(str(sp, "per", 4)); return (PAGE_SIZES as readonly number[]).includes(n) ? n : def; };

/** `/base?a=1&b=2` from the non-empty params (empty / undefined / default values are dropped). */
export function listHref(base: string, params: Record<string, string | number | undefined | null>, omit: Record<string, string | number> = {}) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) { if (v === undefined || v === null || v === "" || String(omit[k]) === String(v)) continue; u.set(k, String(v)); }
  const q = u.toString();
  return q ? `${base}?${q}` : base;
}
