// Tiny forward-only migration runner:  npm run db:migrate
// Files in scripts/migrations/NNN-name.ts export `up(db)`; applied names are recorded in the `_migrations` collection.
// Rules: migrations must be idempotent and additive/backwards-compatible with the previous app version (so a rollback of the
// app code never needs a database rollback). Take a backup (Atlas snapshot) before destructive ones.
import { readdirSync } from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

async function main() {
  if (!uri || !dbName) throw new Error("MONGODB_URI and MONGODB_DB must be set");
  await mongoose.connect(uri, { dbName, autoIndex: false });
  const db = mongoose.connection.db!;
  const done = db.collection<{ _id: string; at: Date }>("_migrations");
  const files = readdirSync(path.join(__dirname, "migrations")).filter((f) => /^\d{3}-.+\.ts$/.test(f)).sort();
  let ran = 0;
  for (const f of files) {
    const name = f.replace(/\.ts$/, "");
    if (await done.findOne({ _id: name })) continue;
    console.log(`→ ${name}`);
    const mod = await import(path.join(__dirname, "migrations", f));
    await mod.up(db);
    await done.insertOne({ _id: name, at: new Date() });
    ran++;
  }
  console.log(ran ? `Applied ${ran} migration(s).` : "Database is up to date.");
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
