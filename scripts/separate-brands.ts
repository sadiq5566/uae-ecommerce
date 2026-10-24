// Separates brands from categories in the existing catalogue.
//
//   npx tsx --env-file=.env scripts/separate-brands.ts            dry run: only counts and shows examples
//   npx tsx --env-file=.env scripts/separate-brands.ts --apply    writes the changes
//   add --remove-empty-collections to also delete the "All <Brand>" category pages that are left empty
//
// Before: "all-cartier", "all-louis-vuitton", "all-footwear", "new-arrivals", "kill"... were used as categories.
// After:  a brand-named category is replaced by what the product is (watches / jewelry / bags / footwear / perfume / accessories, read from its name),
//         "general" when it cannot be told, and the brand sits in the `brand` field. Your own categories (anything that is not a brand, a
//         campaign or an alias below) are left exactly as they are.
//   - a category that was really a brand ("all-cartier") becomes the brand
//   - a product with no real brand (empty, "Carts Heaven", "Rimal UAE") gets the brand read from its name (lib/brands.ts)
//   - the category of the rest is read from the name / subcategory / tags (lib/category.ts); "all-footwear" -> footwear, "pouches" -> bags
// Nothing is deleted. Prices, images, stock and slugs are untouched.
import mongoose from "mongoose";
import { guessCategory } from "../lib/category";
import { brandFromCategorySlug, inferBrand, isPlaceholderBrand, looksLikeBrand } from "../lib/brands";

const OTHER_CATEGORY = "general";

const apply = process.argv.includes("--apply");
const removeEmpty = process.argv.includes("--remove-empty-collections");

/** Categories that are neither a product type nor a brand: shop campaigns and leftovers. */
/** Categories this project's admin keeps: a page is only removed when it is a brand / campaign page. */
const KEEP_PAGE = (parent: string) => !(looksLikeBrand(parent) || CAMPAIGN.has(parent) || ALIAS[parent] !== undefined);
const CAMPAIGN = new Set(["kill", "new-arrivals", "all-products", "top-10-bestsellers", "general"]);
const ALIAS: Record<string, string> = { "all-footwear": "footwear", footwear: "footwear", pouches: "bags", "all-glasses": "accessories", "jewelry-set": "jewelry" };

(async () => {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB || undefined });
  const col = mongoose.connection.db!.collection("products");
  const ops: mongoose.mongo.AnyBulkWriteOperation[] = [];
  const catMoves: Record<string, number> = {};
  const brandMoves: Record<string, number> = {};
  const examples: string[] = [];
  let unfiled = 0;

  for await (const p of col.find({}, { projection: { name: 1, category: 1, subcategory: 1, tags: 1, brand: 1 } })) {
    const cat = String(p.category ?? "");
    const text = [p.name, p.subcategory, ...(p.tags ?? [])].filter(Boolean).join(" ").replace(/[-_]+/g, " ");
    const set: Record<string, string> = {};

    // category
    let nextCat = cat;
    if (looksLikeBrand(cat) || CAMPAIGN.has(cat) || ALIAS[cat] !== undefined) nextCat = ALIAS[cat] ?? guessCategory(text) ?? OTHER_CATEGORY;
    if (nextCat === OTHER_CATEGORY) nextCat = guessCategory(text) ?? OTHER_CATEGORY; // "general" products that clearly are a bag / shoe / watch by name
    if (nextCat !== cat) set.category = nextCat;
    if (nextCat === OTHER_CATEGORY) unfiled++;

    // brand
    const wasBrandCategory = looksLikeBrand(cat) && !CAMPAIGN.has(cat) && ALIAS[cat] === undefined;
    let nextBrand = String(p.brand ?? "");
    if (isPlaceholderBrand(nextBrand)) {
      const found = inferBrand(String(p.name ?? "")) ?? (wasBrandCategory ? brandFromCategorySlug(cat) : undefined);
      if (found) nextBrand = found;
    }
    if (nextBrand !== (p.brand ?? "")) set.brand = nextBrand;

    if (!Object.keys(set).length) continue;
    if (set.category) catMoves[`${cat} -> ${set.category}`] = (catMoves[`${cat} -> ${set.category}`] ?? 0) + 1;
    if (set.brand) brandMoves[set.brand] = (brandMoves[set.brand] ?? 0) + 1;
    if (examples.length < 12) examples.push(`${String(p.name).slice(0, 48)} | ${cat} / ${p.brand ?? "-"}  =>  ${set.category ?? cat} / ${set.brand ?? p.brand ?? "-"}`);
    ops.push({ updateOne: { filter: { _id: p._id }, update: { $set: set } } });
  }

  console.log(apply ? "APPLYING" : "DRY RUN", `- ${ops.length} product(s) change`);
  console.log("category moves:", Object.entries(catMoves).sort((a, b) => b[1] - a[1]).slice(0, 25));
  console.log("brands set:", Object.entries(brandMoves).sort((a, b) => b[1] - a[1]).slice(0, 25));
  console.log("category \"general\" (pick one in the admin):", unfiled);
  console.log("examples:\n  " + examples.join("\n  "));
  if (apply && ops.length) {
    for (let i = 0; i < ops.length; i += 1000) await col.bulkWrite(ops.slice(i, i + 1000));
    console.log("done");
  }
  if (removeEmpty) {
    // "All Cartier" style category pages: delete the ones that no longer have a single product.
    const cols = mongoose.connection.db!.collection("collections");
    const gone: string[] = [];
    for (const c of await cols.find({ type: "category" }, { projection: { slug: 1, parent: 1 } }).toArray()) {
      const parent = String(c.parent ?? "");
      if (!parent || KEEP_PAGE(parent)) continue;
      if ((await col.countDocuments({ category: parent })) === 0) gone.push(String(c.slug));
    }
    console.log(apply ? "removing" : "would remove", gone.length, "empty category page(s):", gone.slice(0, 30));
    if (apply && gone.length) await cols.deleteMany({ slug: { $in: gone } });
  }
  if (!apply) console.log("\nLooks right? run again with --apply");
  await mongoose.disconnect();
})();
