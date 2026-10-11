import { z } from "zod";

export const SORTS = ["relevance", "price_asc", "price_desc", "newest", "rating", "popular"] as const;
export const PAGE_SIZE = 12;

const num = z.coerce.number().finite().min(0).max(1_000_000);
const flag = z.preprocess((v) => v === "1" || v === "true" || v === "on", z.boolean());

export const filterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  brand: z.array(z.string().trim().max(60)).max(10).default([]),
  minPrice: num.optional(),
  maxPrice: num.optional(),
  rating: z.coerce.number().int().min(1).max(4).optional(),
  inStock: flag.default(false),
  onSale: flag.default(false),
  sort: z.enum(SORTS).default("relevance"),
  page: z.coerce.number().int().min(1).max(500).default(1),
  // Category attribute filters, e.g. attr.color=Black (keys validated against the category).
  attrs: z.record(z.string(), z.array(z.string().max(60)).max(10)).default({}),
});

export type Filters = z.infer<typeof filterSchema>;

type Raw = Record<string, string | string[] | undefined>;
const arr = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** Parse Next.js searchParams into validated filters. Invalid values fall back to defaults. */
export function parseFilters(raw: Raw): Filters {
  const attrs: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith("attr.") && /^[a-z0-9_-]{1,30}$/i.test(k.slice(5))) attrs[k.slice(5)] = arr(v);
  }
  const first = (k: string) => (Array.isArray(raw[k]) ? raw[k]![0] : raw[k]);
  const res = filterSchema.safeParse({
    q: first("q"), brand: arr(raw.brand), minPrice: first("minPrice") || undefined, maxPrice: first("maxPrice") || undefined,
    rating: first("rating") || undefined, inStock: first("inStock"), onSale: first("onSale"),
    sort: first("sort") || undefined, page: first("page") || undefined, attrs,
  });
  return res.success ? res.data : filterSchema.parse({});
}

/** Serialise filters back to a query string (for pagination / shareable links). */
export function toQuery(f: Partial<Filters>, overrides: Partial<Filters> = {}) {
  const m = { ...f, ...overrides };
  const p = new URLSearchParams();
  if (m.q) p.set("q", m.q);
  m.brand?.forEach((b) => p.append("brand", b));
  if (m.minPrice != null) p.set("minPrice", String(m.minPrice));
  if (m.maxPrice != null) p.set("maxPrice", String(m.maxPrice));
  if (m.rating) p.set("rating", String(m.rating));
  if (m.inStock) p.set("inStock", "1");
  if (m.onSale) p.set("onSale", "1");
  if (m.sort && m.sort !== "relevance") p.set("sort", m.sort);
  if (m.page && m.page > 1) p.set("page", String(m.page));
  Object.entries(m.attrs ?? {}).forEach(([k, vs]) => vs.forEach((v) => p.append(`attr.${k}`, v)));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** True when any non-default filter/sort/page is active (such URLs are noindex). */
export const isFiltered = (f: Filters) =>
  !!(f.brand.length || f.minPrice != null || f.maxPrice != null || f.rating || f.inStock || f.onSale || f.sort !== "relevance" || f.page > 1 || Object.keys(f.attrs).length);
