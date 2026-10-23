/* eslint-disable @typescript-eslint/no-explicit-any */
import { ProductModel } from "./models/Product";
import { productSchema, type ProductInput } from "./validators/product";
import { slugify } from "./utils";
import { resolveCategory } from "./category";
import { VARIANTS_FIELD } from "./import-group";

export type ImportItem = { line: number; record: Record<string, string> };
export type RowResult = {
  line: number;
  sku: string;
  name: string;
  action: "create" | "update" | "error";
  errors: string[];
  data?: ProductInput;
};

type Existing = Record<string, unknown> & { sku: string; slug: string };

const split = (s?: string) => (s ?? "").split("|").map((x) => x.trim()).filter(Boolean);
/** Stock given to imported products that arrive with no stock (or 0). Set IMPORT_DEFAULT_STOCK=0 to turn this off. */
const DEFAULT_STOCK = Number(process.env.IMPORT_DEFAULT_STOCK ?? 20);
const TRUE = new Set(["true", "yes", "y", "1"]);
const FALSE = new Set(["false", "no", "n", "0"]);
const STATUS_ALIAS: Record<string, "active" | "draft" | "archived"> = { active: "active", published: "active", live: "active", draft: "draft", archived: "archived", archive: "archived" };

/** Shortens text that is over a field's limit at a word boundary (with "…") so one long supplier title or description never rejects the whole row. */
function clip(s: string, max: number) {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + "…";
}

/** "AED 1,299.50" -> 1299.5; returns an Error message string for anything that is not a plain non-negative number. */
function money(v: string, label: string): number | string {
  const cleaned = v.replace(/aed|,|\s/gi, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return `${label}: "${v}" is not a valid number`;
  const n = Number(cleaned);
  return n > 1_000_000 ? `${label}: ${n} is too large` : Math.round(n * 100) / 100;
}

function whole(v: string, label: string): number | string {
  const cleaned = v.replace(/,/g, "").trim();
  return /^\d+$/.test(cleaned) ? Number(cleaned) : `${label}: "${v}" must be a whole number of 0 or more`;
}

/** Existing product -> the loose input shape, so an update only changes the cells that are filled in. */
function baseFromExisting(e: Existing) {
  const x = e as Record<string, any>;
  return {
    sku: e.sku,
    name: x.name,
    slug: e.slug,
    category: x.category,
    subcategory: x.subcategory,
    brand: x.brand,
    model: x.model,
    shortDescription: x.shortDescription,
    longDescription: x.longDescription ?? "",
    highlights: x.highlights ?? [],
    finish: x.finish,
    includedItems: x.includedItems ?? [],
    images: (x.images ?? []).map((i: any) => ({ url: i.url, alt: i.alt, publicId: i.publicId })),
    priceFrom: x.priceFrom,
    priceTo: x.priceTo,
    variants: (x.variants ?? []).map((v: any) => ({ sku: v.sku, color: v.color, size: v.size, price: v.price, stock: v.stock, image: v.image })),
    stock: x.stock ?? 0,
    tags: x.tags ?? [],
    isNewArrival: !!x.isNewArrival,
    isFeatured: !!x.isFeatured,
    isMostWanted: !!x.isMostWanted,
    status: x.status ?? "active",
    seo: x.seo ?? {},
  } as Record<string, any>;
}

/**
 * Validates import rows against the product schema plus the database (existing SKUs and slug owners).
 * Pure with respect to writes: nothing is saved here, so it can power both the preview and the batch import.
 * Rules: SKU is the upsert key; an empty cell on an existing product means "leave unchanged"; new products default to draft.
 */
export async function validateRecords(items: ImportItem[]): Promise<RowResult[]> {
  const skus = [...new Set(items.map((i) => (i.record.sku ?? "").trim()).filter(Boolean))];
  const guesses = items.map((i) => slugify(i.record.slug || i.record.name || "")).filter(Boolean);
  const [existingDocs, slugDocs] = await Promise.all([
    ProductModel.find({ sku: { $in: skus } }).lean<Existing[]>(),
    ProductModel.find({ slug: { $in: guesses } }, { sku: 1, slug: 1 }).lean<{ sku: string; slug: string }[]>(),
  ]);
  const existing = new Map(existingDocs.map((d) => [d.sku, d]));
  const slugOwner = new Map(slugDocs.map((d) => [d.slug, d.sku]));
  for (const d of existingDocs) slugOwner.set(d.slug, d.sku);
  const seenSku = new Set<string>();

  return items.map(({ line, record: r }): RowResult => {
    const sku = (r.sku ?? "").trim();
    const errors: string[] = [];
    const fail = (): RowResult => ({ line, sku, name: r.name ?? "", action: "error", errors });

    if (!sku) {
      errors.push("sku: required on every row");
      return fail();
    }
    if (!/^[A-Za-z0-9._-]{2,40}$/.test(sku)) errors.push("sku: use 2-40 letters, numbers, . _ -");
    if (seenSku.has(sku.toLowerCase())) errors.push("sku: duplicated inside this file");
    seenSku.add(sku.toLowerCase());

    const old = existing.get(sku);
    const input: Record<string, any> = old ? baseFromExisting(old) : { sku, brand: "Carts Heaven", status: "draft", currency: "AED", variants: [], highlights: [], isNewArrival: false, isFeatured: false, isMostWanted: false, seo: {} };
    const has = (k: string) => (r[k] ?? "") !== "";

    if (has("name")) input.name = clip(r.name, 200);
    if (has("category")) {
      const c = resolveCategory(r.category); // any category (bags, perfume…) is accepted and created on import
      if (c !== "general") input.category = c;
      else errors.push(`category: "${r.category}" is not a valid category name`);
    }
    for (const [col, key] of [["subcategory", "subcategory"], ["brand", "brand"], ["model", "model"], ["finish", "finish"], ["short_description", "shortDescription"], ["long_description", "longDescription"]] as const) {
      if (has(col)) input[key] = key === "shortDescription" ? clip(r[col], 400) : key === "longDescription" ? clip(r[col], 5000) : r[col];
    }
    if (has("slug")) input.slug = slugify(r.slug);
    if (has("included_items")) input.includedItems = split(r.included_items);
    if (has("highlights")) input.highlights = split(r.highlights);
    if (has("tags")) input.tags = split(r.tags);
    if (has("images")) input.images = split(r.images).map((url) => ({ url, alt: input.name ?? "" }));
    if (has("currency") && r.currency.toUpperCase() !== "AED") errors.push(`currency: only AED is supported (got "${r.currency}")`);

    for (const [col, key] of [["price_from", "priceFrom"], ["price_to", "priceTo"]] as const) {
      if (!has(col)) continue;
      const n = money(r[col], col);
      if (typeof n === "string") errors.push(n);
      else input[key] = n;
    }
    // A single price column is fine: no struck-through price then. A selling price above the original price is lifted to match it.
    if (input.priceTo != null && input.priceFrom == null) input.priceFrom = input.priceTo;
    if (input.priceFrom != null && input.priceTo == null) input.priceTo = input.priceFrom;
    if (input.priceTo != null && input.priceFrom != null && input.priceTo > input.priceFrom) input.priceFrom = input.priceTo;

    let cellStock: number | undefined;
    if (has("stock")) {
      const n = whole(r.stock, "stock");
      if (typeof n === "string") errors.push(n);
      else cellStock = n;
    }
    // On a full product row (it has a name) a missing or 0 stock becomes DEFAULT_STOCK; an empty cell keeps stock the product already has.
    // Partial rows such as "sku,price_to" never touch stock.
    const full = has("name");
    const stockFor = (cell: number | undefined, existing?: number) => {
      if (cell && cell > 0) return cell;
      if (cell === undefined && existing && existing > 0) return existing;
      return full ? DEFAULT_STOCK : (cell ?? existing ?? 0);
    };
    if (has(VARIANTS_FIELD)) {
      // A merged group of file rows (lib/import-group.ts): one variant per row.
      try {
        const list = JSON.parse(r[VARIANTS_FIELD]);
        if (!Array.isArray(list) || !list.length || list.length > 500) throw new Error("bad");
        const oldVariants: any[] = old ? ((old as any).variants ?? []) : [];
        input.variants = list.map((v: any) => {
          if (typeof v.stock === "string") return v; // not a number: let validation report it
          const before = oldVariants.find((o) => o.sku === v.sku)?.stock ?? (old && old.sku === v.sku ? (old as any).stock : undefined);
          return { ...v, stock: stockFor(v.stock, before) };
        });
        input.stock = input.variants.reduce((s: number, v: any) => s + (Number(v?.stock) || 0), 0);
      } catch {
        errors.push("variants: could not read the grouped colour/size rows");
      }
    } else if (has("color") || has("size")) {
      // A single colour and/or size on a row becomes one variant carrying the stock.
      const vsku = has("color") ? `${sku}-${slugify(r.color)}`.toUpperCase() : sku;
      input.variants = [{ sku: vsku, ...(has("color") && { color: r.color }), ...(has("size") && { size: r.size }), stock: stockFor(cellStock, (old as any)?.stock) }];
    } else if (Array.isArray(input.variants) && input.variants.length === 1 && (has("stock") || full)) {
      input.variants = [{ ...input.variants[0], stock: stockFor(cellStock, input.variants[0].stock) }];
    } else if (!input.variants?.length && (cellStock !== undefined || full)) {
      input.stock = stockFor(cellStock, input.stock);
    }
    if (Array.isArray(input.variants) && input.variants.length === 1 && !has(VARIANTS_FIELD)) input.stock = input.variants[0].stock;
    if (has("status")) {
      const s = STATUS_ALIAS[r.status.toLowerCase()];
      if (s) input.status = s;
      else errors.push(`status: "${r.status}" must be active, draft or archived`);
    }
    for (const [col, key] of [["is_new", "isNewArrival"], ["is_featured", "isFeatured"], ["is_most_wanted", "isMostWanted"]] as const) {
      if (!has(col)) continue;
      const v = r[col].toLowerCase();
      if (TRUE.has(v)) input[key] = true;
      else if (FALSE.has(v)) input[key] = false;
      else errors.push(`${col}: "${r[col]}" must be true or false`);
    }

    if (!input.shortDescription && input.longDescription) input.shortDescription = String(input.longDescription).slice(0, 160);
    if (!input.finish && has("color")) input.finish = r.color;
    else if (!input.finish && input.variants?.[0]?.color) input.finish = input.variants[0].color;
    if (!input.category) input.category = resolveCategory("", [input.name, input.subcategory, ...(input.tags ?? [])].filter(Boolean).join(" "));
    if (!input.subcategory && !old) input.subcategory = "general";

    if (!old) {
      const need: [string, unknown][] = [["name", input.name], ["price_to", input.priceTo], ["images", input.images?.length], ["short_description or long_description", input.shortDescription]];
      for (const [label, v] of need) if (!v && v !== 0 && !errors.some((e) => e.startsWith(label.split(" ")[0]))) errors.push(`${label}: required for a new product`);
    }
    if (errors.length) return fail();
    const parsed = productSchema.safeParse(input);
    if (!parsed.success) {
      errors.push(...parsed.error.issues.map((x) => `${x.path.join(".") || "row"}: ${x.message}`));
      return fail();
    }
    const data = parsed.data;

    // Slug rules: an explicit slug that belongs to another SKU is an error; an auto slug gets the SKU appended.
    let slug = data.slug;
    if (!slug) {
      errors.push("slug: could not be generated from the name");
      return fail();
    }
    const owner = slugOwner.get(slug);
    if (owner && owner !== sku) {
      if (has("slug")) {
        errors.push(`slug: "${slug}" is already used by ${owner}`);
        return fail();
      }
      slug = slugify(`${data.name}-${sku}`);
      if (slugOwner.get(slug) && slugOwner.get(slug) !== sku) {
        errors.push(`slug: "${slug}" is already used by ${slugOwner.get(slug)}`);
        return fail();
      }
    }
    slugOwner.set(slug, sku);
    data.slug = slug;

    const grouped = has(VARIANTS_FIELD) && data.variants.length > 1;
    return { line, sku, name: grouped ? `${data.name} · ${data.variants.length} variants` : data.name, action: old ? "update" : "create", errors: [], data };
  });
}
