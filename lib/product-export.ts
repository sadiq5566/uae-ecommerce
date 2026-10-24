import { ProductModel } from "./models/Product";
import { CollectionModel } from "./models/Collection";
import { toCsv } from "./csv";

/** Same columns the importer reads, so an exported file can be edited and imported straight back. */
export const EXPORT_PRODUCT_HEADERS = [
  "sku", "name", "slug", "category", "subcategory", "brand", "model", "color", "finish", "price_from", "price_to", "currency",
  "short_description", "long_description", "included_items", "images", "stock", "status", "tags", "highlights", "is_new", "is_featured", "is_most_wanted",
];

export const EXPORT_COLLECTION_HEADERS = ["slug", "name", "description", "image", "parent", "type", "sort_order"];

type P = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function productsCsv() {
  const rows: unknown[][] = [];
  for await (const d of ProductModel.find().sort({ createdAt: 1 }).lean<P[]>().cursor()) {
    rows.push([
      d.sku, d.name, d.slug, d.category, d.subcategory, d.brand, d.model,
      d.variants?.length === 1 ? d.variants[0].color ?? "" : "", // several variants cannot be expressed in one cell: keep them out
      d.finish, d.priceFrom, d.priceTo, d.currency ?? "AED",
      d.shortDescription, d.longDescription, (d.includedItems ?? []).join("|"), (d.images ?? []).map((i: P) => i.url).join("|"),
      d.stock, d.status, (d.tags ?? []).join("|"), (d.highlights ?? []).join("|"),
      !!d.isNewArrival, !!d.isFeatured, !!d.isMostWanted,
    ]);
  }
  return toCsv(EXPORT_PRODUCT_HEADERS, rows);
}

export async function collectionsCsv() {
  const docs = await CollectionModel.find().sort({ sortOrder: 1, slug: 1 }).lean<P[]>();
  return toCsv(EXPORT_COLLECTION_HEADERS, docs.map((d) => [d.slug, d.name, d.description ?? "", d.image ?? "", d.parent ?? "", d.type, d.sortOrder ?? 0]));
}
