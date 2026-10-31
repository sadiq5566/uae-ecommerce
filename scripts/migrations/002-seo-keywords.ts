import type { Db } from "mongodb";

/**
 * SEO keywords / hashtags: gives every existing product and category (collection) the new empty seo.keywords field so all documents
 * have the same shape. Only fills what is missing, never overwrites; safe to run twice.
 */
export async function up(db: Db) {
  for (const name of ["products", "collections", "brands"]) await db.collection(name).updateMany({ "seo.keywords": { $exists: false } }, { $set: { "seo.keywords": "" } });
  const i18n = { en: "", ar: "" };
  for (const name of ["articles", "contentpages", "homepages"]) {
    const c = db.collection(name);
    for (const f of ["title", "description", "keywords"]) await c.updateMany({ [`seo.${f}`]: { $exists: false } }, { $set: { [`seo.${f}`]: i18n } });
  }
}
