import type { RowIssue } from "./products";

export const CATEGORY_COLUMNS: Record<string, string[]> = {
  slug: [], parent_slug: ["parent"], name_en: ["name", "name_english"], name_ar: ["name_arabic"], description_en: ["description"], description_ar: [],
  icon: [], order: ["sort_order"], active: [], attributes: ["attrs"],
};
export const CATEGORY_TEMPLATE_HEADERS = ["slug", "parent_slug", "name_en", "name_ar", "description_en", "description_ar", "icon", "order", "active", "attributes"];

export type CategoryCtx = { bySlug: Map<string, { id: string; parent: string | null }>; present: Set<string> };

const bool = (s: string) => (/^(true|1|yes|y)$/i.test(s) ? true : /^(false|0|no|n)$/i.test(s) ? false : null);

/** Attributes format: key:English label/Arabic label|key2:English/Arabic */
export function parseAttributes(s: string): { ok: true; attrs: { key: string; label: { en: string; ar: string } }[] } | { ok: false; error: string } {
  const out: { key: string; label: { en: string; ar: string } }[] = [];
  for (const part of s.split("|").map((p) => p.trim()).filter(Boolean)) {
    const i = part.indexOf(":"); const key = part.slice(0, i).trim().toLowerCase(); const [en, ar] = part.slice(i + 1).split("/").map((x) => x.trim());
    if (i < 1 || !/^[a-z0-9_-]{1,30}$/.test(key) || !en || !ar) return { ok: false, error: `attributes must look like key:English label/Arabic label|… (got "${part}")` };
    out.push({ key, label: { en, ar } });
  }
  if (new Set(out.map((a) => a.key)).size !== out.length) return { ok: false, error: "duplicate attribute keys" };
  return { ok: true, attrs: out.slice(0, 12) };
}

export function validateCategoryRows(rows: Record<string, string>[], ctx: CategoryCtx, firstLine = 2): RowIssue[] {
  const inFile = new Map<string, { line: number; parent: string }>();
  rows.forEach((r, i) => { const s = (r.slug ?? "").toLowerCase(); if (s && !inFile.has(s)) inFile.set(s, { line: firstLine + i, parent: (r.parent_slug ?? "").toLowerCase() }); });
  const seen = new Set<string>();
  return rows.map((r, idx) => {
    const line = firstLine + idx; const errors: string[] = []; const slug = (r.slug ?? "").toLowerCase();
    const has = (c: string) => ctx.present.has(c) && (r[c] ?? "") !== "";
    if (!slug) return { line, sku: "", action: "error", errors: ["slug is required (it identifies the category)"] };
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) errors.push("slug must be lowercase letters, numbers and hyphens");
    if (seen.has(slug)) errors.push("duplicate slug in this file"); seen.add(slug);
    const existing = ctx.bySlug.get(slug);
    const doc: Record<string, unknown> = {};
    if (!existing) for (const req of ["name_en", "name_ar"]) if (!has(req)) errors.push(`${req} is required to create a new category`);
    if (has("name_en")) doc["name.en"] = r.name_en.slice(0, 100);
    if (has("name_ar")) doc["name.ar"] = r.name_ar.slice(0, 100);
    if (has("description_en")) doc["description.en"] = r.description_en.slice(0, 500);
    if (has("description_ar")) doc["description.ar"] = r.description_ar.slice(0, 500);
    if (has("icon")) doc.icon = r.icon.slice(0, 8);
    if (has("order")) { const n = Number(r.order); if (!Number.isInteger(n) || n < 0 || n > 10000) errors.push("order must be a whole number 0–10000"); else doc.order = n; }
    if (has("active")) { const b = bool(r.active); if (b === null) errors.push("active must be true/false"); else doc.active = b; }
    if (has("attributes")) { const a = parseAttributes(r.attributes); if (!a.ok) errors.push(a.error); else doc.attributes = a.attrs; }
    if (ctx.present.has("parent_slug") && (r.parent_slug ?? "") !== "") {
      const p = r.parent_slug.toLowerCase();
      if (p === slug) errors.push("a category can't be its own parent");
      else {
        const inDb = ctx.bySlug.get(p); const inThisFile = inFile.get(p);
        if (!inDb && !inThisFile) errors.push(`unknown parent_slug "${p}"`);
        // Max two levels (top-level → child): this also makes cycles impossible.
        else if ((inDb && inDb.parent) || (!inDb && inThisFile && inThisFile.parent)) errors.push(`parent "${p}" is itself a subcategory; only two levels are supported`);
        else doc.parentSlug = p;
      }
    }
    if (errors.length) return { line, sku: slug, action: "error", errors };
    return { line, sku: slug, action: existing ? "update" : "create", errors: [], doc };
  });
}
