import "server-only";
import mongoose from "mongoose";
import { getEnv } from "./env";

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
