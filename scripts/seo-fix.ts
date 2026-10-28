/* eslint-disable @typescript-eslint/no-explicit-any */
// One-off catalogue clean-up for search engines and branding. Dry run by default; nothing is written without --apply.
//
//   npm run db:seo-fix              report only
//   npm run db:seo-fix -- --apply   backs up products + collections to ./backups, then writes
//
// What it does, per product:
//   - removes supplier shop names (Rimal / Rimal UAE / Carts Heaven) from brand and text; the brand becomes the real brand read from the
//     name, else this store's name (STORE_NAME, default "Rayana Collection")
//   - strips the internal "(GEN-xxxx)" import code from names (slugs never change, so URLs and redirects keep working)
//   - moves "general" (and junk) categories to a real one using the name (English and Arabic keywords)
//   - rebuilds descriptions that are broken (supplier text, name glued to the first sentence, too short); other descriptions keep their text,
//     get a clean short description and a closing UAE delivery paragraph
//   - fills seo.title / seo.description, and the SEO text of each category page
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { guessCategory } from "../lib/category";
import { categoryLabel, categoryTitle } from "../lib/catalog-shared";
import { SEO_LABEL, STORE_NAME, categoryCopy, cleanName, hasArabic, hasSupplierName, plainName, productCopy, resolveBrand, stripSupplier } from "../lib/seo-copy";

const apply = process.argv.includes("--apply") || process.env.npm_config_apply === "true";
const JUNK = new Set(["general", "lambskin", "jadore", ""]);

/** First sentence(s) of the description that fit a snippet, never cut mid-word. */
function shorten(text: string, max = 155) {
  const first = text.split(/\n\s*\n/)[0].replace(/\s+/g, " ").trim();
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "));
  if (stop > max * 0.5) return cut.slice(0, stop + 1);
  const comma = cut.lastIndexOf(", ");
  if (comma > max * 0.5) return cut.slice(0, comma) + ".";
  const sp = cut.lastIndexOf(" ");
  return cut.slice(0, sp > max * 0.6 ? sp : max - 1).replace(/[\s,;:–-]+$/, "") + "…";
}

const glued = (name: string, text: string) => {
  const n = plainName(name), i = text.indexOf(n);
  return i === 0 && /^[A-Za-z]/.test(text.slice(n.length, n.length + 1)) && /[a-z]/.test(text.slice(n.length - 1, n.length));
};

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB || undefined });
  const db = mongoose.connection.db!;
  const products = db.collection("products"), collections = db.collection("collections");
  console.log(`${apply ? "APPLY" : "DRY RUN"} on database "${db.databaseName}" as "${STORE_NAME}"`);

  if (apply) {
    const dir = path.join(process.cwd(), "backups");
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeFile(path.join(dir, `products-${stamp}.json`), JSON.stringify(await products.find().toArray()));
    await writeFile(path.join(dir, `collections-${stamp}.json`), JSON.stringify(await collections.find().toArray()));
    console.log(`backup written to ${dir}`);
  }

  const stats = { total: 0, changed: 0, name: 0, brand: 0, category: 0, rebuilt: 0, appended: 0, supplierText: 0 };
  const cats = new Map<string, { n: number; brands: Map<string, number> }>();
  const samples: any[] = [];
  const ops: any[] = [];

  for await (const p of products.find()) {
    stats.total++;
    const set: Record<string, unknown> = {};
    const name = cleanName(p.name ?? "");
    if (name !== p.name) { set.name = name; stats.name++; }

    let category = p.category as string;
    if (JUNK.has(category)) {
      const hint = [name, p.subcategory, ...(p.tags ?? [])].filter(Boolean).join(" ").replace(/[-_]+/g, " ");
      category = guessCategory(hint) ?? category;
      if (category !== p.category) { set.category = category; stats.category++; }
    }

    const brand = resolveBrand(p.brand === STORE_NAME ? "" : p.brand, name); // the store name as brand is only a stand-in: look again
    if (brand !== p.brand && (!p.brand || hasSupplierName(p.brand) || /^carts heaven$|^rimal/i.test(p.brand) || (p.brand === STORE_NAME && brand !== STORE_NAME))) { set.brand = brand; stats.brand++; }
    const finalBrand = (set.brand as string) ?? p.brand;

    const colors = [...new Set((p.variants ?? []).map((v: any) => v.color).filter(Boolean))] as string[];
    const copy = productCopy({ sku: p.sku, name, brand: finalBrand, category, colors });
    const long: string = p.longDescription ?? "";
    const broken = !long || long.length < 80 || hasSupplierName(long) || hasSupplierName(p.shortDescription) || glued(name, long);
    if (hasSupplierName(long) || hasSupplier(p)) stats.supplierText++;
    if (!hasArabic(name)) {
      if (broken) { set.longDescription = copy.longDescription; set.shortDescription = copy.shortDescription; stats.rebuilt++; }
      else {
        const tail = `Buy ${plainName(name)} online in the UAE at ${STORE_NAME}: fast delivery in Dubai, Abu Dhabi, Sharjah and across all emirates, cash on delivery and easy returns.`;
        if (!long.includes(STORE_NAME)) { set.longDescription = `${long.trimEnd()}\n\n${tail}`; stats.appended++; }
        const short = shorten(long);
        if (short !== p.shortDescription) set.shortDescription = short;
      }
    } else if (hasSupplierName(long) || hasSupplierName(p.shortDescription)) {
      set.longDescription = stripSupplier(long); set.shortDescription = stripSupplier(p.shortDescription ?? "");
    }
    for (const f of ["highlights", "includedItems", "tags"] as const) {
      if ((p[f] ?? []).some((x: string) => hasSupplierName(x))) set[f] = p[f].map((x: string) => stripSupplier(x));
    }
    if (!p.seo?.title || hasSupplierName(p.seo.title)) set["seo.title"] = copy.seoTitle;
    if (!p.seo?.description || hasSupplierName(p.seo.description)) set["seo.description"] = copy.seoDescription;

    const c = cats.get(category) ?? { n: 0, brands: new Map() };
    c.n++; c.brands.set(finalBrand, (c.brands.get(finalBrand) ?? 0) + 1); cats.set(category, c);
    if (Object.keys(set).length) {
      stats.changed++;
      set.updatedAt = new Date();
      ops.push({ updateOne: { filter: { _id: p._id }, update: { $set: set } } });
      if (samples.length < 4 && set.longDescription) samples.push({ before: p.name, set });
    }
  }

  console.log(stats);
  console.log("categories after:", Object.fromEntries([...cats].map(([k, v]) => [k, v.n])));
  console.log("samples:", JSON.stringify(samples.slice(0, 3), null, 1));

  const catOps = [...cats].filter(([k]) => k !== "general").map(([slug, v]) => {
    const top = [...v.brands].sort((a, b) => b[1] - a[1]).map(([b]) => b);
    const cc = categoryCopy(SEO_LABEL[slug] ?? categoryLabel(slug), top, v.n);
    return { slug, cc, op: { updateOne: { filter: { slug: `all-${slug}` }, update: { $set: { "seo.title": cc.title, "seo.description": cc.description }, $setOnInsert: { slug: `all-${slug}`, name: categoryTitle(slug), image: "", type: "category", parent: slug, sortOrder: 50 } }, upsert: true } } };
  });
  console.log("category pages:", catOps.map((c) => `${c.slug}: ${c.cc.title} | ${c.cc.description}`));
  // The intro text of a category page is only filled when the admin left it empty.
  const emptyDesc = catOps.map((c) => ({ updateOne: { filter: { slug: `all-${c.slug}`, $or: [{ description: "" }, { description: null }, { description: { $exists: false } }] }, update: { $set: { description: c.cc.intro } } } }));

  if (apply) {
    for (let i = 0; i < ops.length; i += 500) await products.bulkWrite(ops.slice(i, i + 500), { ordered: false });
    await collections.bulkWrite(catOps.map((c) => c.op), { ordered: false });
    await collections.bulkWrite(emptyDesc, { ordered: false });
    console.log(`wrote ${ops.length} products and ${catOps.length} category pages`);
  } else console.log("dry run: nothing written. Re-run with --apply.");
  await mongoose.disconnect();
}

function hasSupplier(p: any) { return [p.name, p.brand, p.shortDescription, p.seo?.title, p.seo?.description, ...(p.highlights ?? []), ...(p.tags ?? [])].some((x) => hasSupplierName(x)); }

main().catch((e) => { console.error(e); process.exit(1); });
