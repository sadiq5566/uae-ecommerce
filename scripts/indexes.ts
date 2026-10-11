// Create/verify all indexes. Run on every deploy:  npm run db:indexes   (add -- --sync to also DROP indexes no longer in the schema)
import mongoose from "mongoose";
import { allModels } from "./models";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

async function main() {
  if (!uri || !dbName) throw new Error("MONGODB_URI and MONGODB_DB must be set");
  await mongoose.connect(uri, { dbName, autoIndex: false });
  const sync = process.argv.includes("--sync");
  for (const m of allModels) {
    if (sync) await m.syncIndexes(); else await m.createIndexes();
    const idx = await m.collection.indexes();
    console.log(`${m.collection.collectionName.padEnd(22)} ${idx.length} indexes${sync ? " (synced)" : ""}`);
  }
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
