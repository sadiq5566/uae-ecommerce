import "server-only";
import { revalidatePath, updateTag } from "next/cache";

/**
 * Call from an admin Server Action after changing anything shoppers see (products, categories, prices, offers, settings, reviews).
 * Listings, product pages and the home collections are cached for up to a minute for speed; this drops those caches at once,
 * so the admin's change shows on the storefront immediately instead of after the cache expires.
 */
export function refreshStoreData() {
  updateTag("store-data");
  revalidatePath("/[lang]", "layout");
}
