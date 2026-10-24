// Pure helpers shared by the MongoDB queries (products.ts) and the sample-catalogue fallback (catalog-memory.ts).

export const PAGE_SIZE = 24;

export type Filters = {
  finish?: string;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort?: "featured" | "newest" | "price-asc" | "price-desc";
  page?: number;
};

export const categoryLabel = (slug: string) => (slug === "general" ? "Other" : slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()));

/** Title of a category's listing page: "All Jewelry", but just "Footwear" when the category slug already starts with "all-". */
export const categoryTitle = (slug: string) => (/^all-/.test(slug) ? categoryLabel(slug.replace(/^all-/, "")) : "All " + categoryLabel(slug));
