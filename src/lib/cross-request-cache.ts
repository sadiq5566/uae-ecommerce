import "server-only";
import { unstable_cache } from "next/cache";

/** Cache a loader across requests for `seconds`. Outside the Next runtime (unit tests) it just calls the loader. */
export function cachedFor<T>(key: string, seconds: number, load: () => Promise<T>): () => Promise<T> {
  return process.env.VITEST ? load : unstable_cache(load, [key], { revalidate: seconds });
}
