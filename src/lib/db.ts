import "server-only";
import mongoose from "mongoose";
import { getEnv } from "./env";

// Production: indexes are created by `npm run db:indexes` during deploys, not implicitly at runtime (index builds on large
// collections are expensive). Set MONGODB_AUTO_INDEX=true to opt back in. Development/tests keep auto-indexing.
mongoose.set("autoIndex", process.env.NODE_ENV !== "production" || process.env.MONGODB_AUTO_INDEX === "true");

// Reuse one connection across hot reloads and serverless invocations.
const g = globalThis as unknown as {
  _mongoose?: { conn?: typeof mongoose; promise?: Promise<typeof mongoose> };
};
const cache = (g._mongoose ??= {});

export async function connectDb() {
  if (cache.conn) return cache.conn;
  const env = getEnv();
  cache.promise ??= mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB,
    bufferCommands: false,
    maxPoolSize: 10,
  });
  try {
    cache.conn = await cache.promise;
  } catch (e) {
    cache.promise = undefined;
    throw e;
  }
  return cache.conn;
}
