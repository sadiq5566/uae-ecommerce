// Usage: npm run db:init
// Creates every collection from lib/models/* (plus lib/models.ts when a project keeps extra models there) and builds its indexes (unique, TTL, text).
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  const dir = join(process.cwd(), "lib", "models");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts") && !/^(models|index.*)\.ts$/.test(f))) await import(pathToFileURL(join(dir, f)).href);
  const extra = join(process.cwd(), "lib", "models.ts");
  if (existsSync(extra)) await import(pathToFileURL(extra).href);

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || undefined });
  for (const m of Object.values(mongoose.models)) {
    await m.createCollection().catch(() => {}); // already exists
    await m.syncIndexes();
    console.log(`✓ ${m.collection.name}`);
  }
  console.log(`
${Object.keys(mongoose.models).length} models ready in "${mongoose.connection.name}"`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
