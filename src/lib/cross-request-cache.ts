import "server-only";
import { unstable_cache } from "next/cache";

/** Cache a loader across requests for `seconds`; results are kept per argument value. Outside the Next runtime (unit tests) it just calls the loader. */
export function cachedFor<A extends unknown[], T>(key: string, seconds: number, load: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
  return process.env.VITEST ? load : unstable_cache(load, [key], { revalidate: seconds });
}
