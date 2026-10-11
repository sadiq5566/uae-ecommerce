import "server-only";
import { headers } from "next/headers";
import { connectDb } from "@/lib/db";
import { RateLimit } from "@/models/rate-limit";

/**
 * Rate-limiter interface so an external store (Redis/Upstash) can replace the Mongo-backed one.
 * Fixed window: `limit` hits per `windowSec` per key.
 */
export interface RateLimiter {
  hit(key: string, limit: number, windowSec: number): Promise<{ ok: boolean; retryAfterSec: number }>;
}

export const mongoRateLimiter: RateLimiter = {
  async hit(key, limit, windowSec) {
    await connectDb();
    const now = new Date();
    // Atomic: reset the window if expired, otherwise increment.
    const doc = await RateLimit.findOneAndUpdate(
      { key },
      [{ $set: {
        count: { $cond: [{ $gt: ["$resetAt", now] }, { $add: ["$count", 1] }, 1] },
        resetAt: { $cond: [{ $gt: ["$resetAt", now] }, "$resetAt", new Date(now.getTime() + windowSec * 1000)] },
      } }],
      { upsert: true, returnDocument: "after", updatePipeline: true },
    ).lean();
    const ok = (doc?.count ?? 1) <= limit;
    return { ok, retryAfterSec: ok ? 0 : Math.max(1, Math.ceil(((doc?.resetAt.getTime() ?? now.getTime()) - now.getTime()) / 1000)) };
  },
};

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export const rateLimit = (key: string, limit: number, windowSec: number) => mongoRateLimiter.hit(key, limit, windowSec);
