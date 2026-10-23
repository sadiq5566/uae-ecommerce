import "server-only";

/** Scheduled sale windows no longer exist: the shared product schema stores the selling price (priceTo) directly. Kept so the cron route still runs. */
export async function refreshSalePrices() {
  return { checked: 0, updated: 0 };
}
