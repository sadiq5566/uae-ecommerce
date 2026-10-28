/* eslint-disable @typescript-eslint/no-explicit-any */
// Gives every Arabic-named product an English name, English description / SEO text and a clean URL, and keeps the Arabic text for the /ar pages.
// Also removes the internal "-gen-xxxx" codes from URLs, cleans Shopify "Default Title" / "اللون:" variant labels.
//
//   npm run db:seo-rename -- <translations.json>             dry run (report only)
//   npm run db:seo-rename -- <translations.json> --apply     backs up to ./backups first, then writes
//
// <translations.json> is { "<Arabic name>": "<English name>" }. Old slugs are kept in slugHistory, so old links 301-redirect to the new URL.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { slugify } from "../lib/utils";
import { cleanName, hasArabic, plainName, productCopy } from "../lib/seo-copy";

const apply = process.argv.includes("--apply") || process.env.npm_config_apply === "true";
const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
const COLORS: Record<string, string> = { "فضة": "Silver", "أسود": "Black", "الذهب": "Gold", "البحرية": "Navy", "متعدد": "Multi" };

/** "S / اللون: أسود" -> { size: "S", color: "Black" }; "العنوان: Default Title" -> {} (no real option). */
function cleanVariant(v: any) {
  const raw = String(v.size ?? "");
  if (!hasArabic(raw) && !hasArabic(String(v.color ?? ""))) return v;
  const out = { ...v };
  const m = raw.match(/^(?:(.*?)\s*\/\s*)?اللون:\s*(.+)$/);
  if (/Default Title/i.test(raw)) delete out.size;
  else if (m) { if (m[1]) out.size = m[1]; else delete out.size; out.color = COLORS[m[2].trim()] ?? m[2].trim(); }
  if (hasArabic(String(out.color ?? ""))) out.color = COLORS[String(out.color).trim()] ?? out.color;
  return out;
}

async function main() {
  if (!file) throw new Error("usage: npm run db:seo-rename -- <translations.json> [--apply]");
  const tr: Record<string, string> = JSON.parse(await readFile(file, "utf8"));
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB || undefined });
  const col = mongoose.connection.db!.collection("products");
  const all = await col.find().toArray();
  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${all.length} products, ${Object.keys(tr).length} translations`);

  if (apply) {
    const dir = path.join(process.cwd(), "backups"); await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `products-before-rename-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), JSON.stringify(all));
    console.log("backup written");
  }

  const taken = new Set(all.map((p) => p.slug as string));
  for (const p of all) for (const h of p.slugHistory ?? []) taken.add(h);
  const stats = { renamed: 0, missing: [] as string[], slugs: 0, variantsFixed: 0, defaultTitleDropped: 0 };
  const ops: any[] = [];

  for (const p of all) {
    const set: Record<string, unknown> = {};
    let name: string = p.name;
    if (hasArabic(p.name)) {
      const en = tr[p.name];
      if (!en || hasArabic(en)) { stats.missing.push(p.name); continue; }
      name = cleanName(en).replace(/\s*\(SKU_\d+_\d+\)/, "");
      Object.assign(set, { nameAr: p.name, shortDescriptionAr: p.shortDescription ?? "", longDescriptionAr: p.longDescription ?? "", name, model: name });
      const colors = [...new Set((p.variants ?? []).map((v: any) => cleanVariant(v).color).filter(Boolean))] as string[];
      const en_ = productCopy({ sku: p.sku, name, brand: p.brand, category: p.category, colors });
      const ar_ = productCopy({ sku: p.sku, name: p.name, brand: p.brand, category: p.category });
      Object.assign(set, { longDescription: en_.longDescription, shortDescription: en_.shortDescription, "seo.title": en_.seoTitle, "seo.description": en_.seoDescription, "seoAr.title": ar_.seoTitle, "seoAr.description": ar_.seoDescription });
      stats.renamed++;
    }
    // URL: no transliterated Arabic, no import codes.
    if (hasArabic(p.name) || /-gen-[0-9a-f]{6,}/.test(p.slug)) {
      const slug = slugify(plainName(name)).slice(0, 80).replace(/-+$/, "") || slugify(p.sku);
      if (slug !== p.slug) {
        let n = 1, cand = slug;
        while (taken.has(cand) && cand !== p.slug) cand = `${slug}-${++n}`;
        if (cand !== p.slug) { taken.add(cand); set.slug = cand; set.slugHistory = [...new Set([...(p.slugHistory ?? []), p.slug])]; stats.slugs++; }
      }
    }
    // Variants: Shopify "Default Title" means "no options"; Arabic option labels become English.
    let variants = (p.variants ?? []).map(cleanVariant);
    if (JSON.stringify(variants) !== JSON.stringify(p.variants ?? [])) stats.variantsFixed++;
    if (variants.length === 1 && !variants[0].color && !variants[0].size && /Default Title/i.test(String(p.variants?.[0]?.size ?? ""))) { variants = []; stats.defaultTitleDropped++; }
    if (JSON.stringify(variants) !== JSON.stringify(p.variants ?? [])) set.variants = variants;
    if (Object.keys(set).length) { set.updatedAt = new Date(); ops.push({ updateOne: { filter: { _id: p._id }, update: { $set: set } } }); }
  }

  console.log({ ...stats, missing: stats.missing.length, ops: ops.length });
  if (stats.missing.length) console.log("no English translation for:", stats.missing.slice(0, 10));
  console.log("sample:", JSON.stringify(ops.slice(0, 2).map((o) => o.updateOne.update.$set), null, 1).slice(0, 1800));
  if (apply) { for (let i = 0; i < ops.length; i += 500) await col.bulkWrite(ops.slice(i, i + 500), { ordered: false }); console.log(`wrote ${ops.length} products`); }
  else console.log("dry run: nothing written. Re-run with --apply.");
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
