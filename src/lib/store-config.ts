// The ONE place that knows which store this deployment is. Never hardcode a store id or order prefix anywhere else.
// Read at call time (not import time) so tests and scripts can switch store by changing process.env.

/** Shared-database mode switch. OFF = the app behaves exactly as before (old database, no storeId filtering, old order numbers). */
export const useSharedDb = () => /^(1|true|yes|on)$/i.test(process.env.USE_SHARED_DB ?? "");
export const storeId = () => process.env.STORE_ID?.trim() || "rayanacollection";
export const orderPrefix = () => (process.env.ORDER_PREFIX?.trim() || "RC").toUpperCase();

export const STORE_IDS = ["cartsheaven", "maisonsnoor", "oasishomemarket", "rayanacollection"] as const;

/** Which database to open: the shared one when USE_SHARED_DB is on, otherwise the store's own old database (OLD_MONGODB_*) if given. */
export function dbTarget() {
  const shared = useSharedDb();
  return {
    uri: (!shared && process.env.OLD_MONGODB_URI) || process.env.MONGODB_URI || "",
    dbName: (!shared && process.env.OLD_MONGODB_DB) || process.env.MONGODB_DB || undefined,
  };
}
