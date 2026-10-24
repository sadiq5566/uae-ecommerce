// Copies collections (documents + indexes) from one database to another on the same Atlas cluster. The source is only read.
//
//   npm run copy-db -- --from=rayanacollection --to=cartsheaven                  dry run: shows what would be copied, writes nothing
//   npm run copy-db -- --from=rayanacollection --to=cartsheaven --apply          copies; REFUSES if the target already has documents in those collections
//   npm run copy-db -- --from=rayanacollection --to=cartsheaven --apply --replace   drops those collections in the target first, then copies
//   --collections=products,collections,settings   limit what is copied (default: every non-empty collection in the source)
//
// Afterwards point the app at the copy: set the database name in MONGODB_URI (…mongodb.net/cartsheaven) or set MONGODB_DB=cartsheaven.
import mongoose from "mongoose";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const flag = (k: string) => process.argv.includes(`--${k}`);
const from = arg("from");
const to = arg("to");
const only = arg("collections")?.split(",").filter(Boolean);
const apply = flag("apply");
const replace = flag("replace");
const BATCH = 500;

async function main() {
  if (!from || !to) throw new Error("Usage: --from=<database> --to=<database> [--collections=a,b] [--apply] [--replace]");
  if (from === to) throw new Error("--from and --to must differ");
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI must be set (.env.local)");
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || undefined });
  const client = mongoose.connection.getClient();
  const src = client.db(from);
  const dst = client.db(to);

  const names = (await src.listCollections().toArray()).map((c) => c.name).filter((n) => !n.startsWith("system.") && (!only || only.includes(n)));
  const plan: { name: string; srcCount: number; dstCount: number }[] = [];
  for (const name of names) {
    const srcCount = await src.collection(name).estimatedDocumentCount();
    if (srcCount === 0 && !only) continue;
    plan.push({ name, srcCount, dstCount: await dst.collection(name).estimatedDocumentCount() });
  }
  console.log(`${from} -> ${to}  (${apply ? (replace ? "APPLY, REPLACE" : "APPLY") : "DRY RUN"})\n`);
  for (const p of plan) console.log(`  ${p.name.padEnd(20)} source ${String(p.srcCount).padStart(6)}   target now ${String(p.dstCount).padStart(6)}`);

  const clash = plan.filter((p) => p.dstCount > 0);
  if (clash.length && !replace) {
    console.log(`\n${clash.length} collection(s) in "${to}" already contain documents (${clash.map((c) => c.name).join(", ")}).`);
    console.log("Nothing will be overwritten. Use a different --to, or add --replace to drop and re-copy those collections.");
    if (apply) process.exitCode = 1;
    return;
  }
  if (!apply) {
    console.log("\nDry run only. Add --apply to copy.");
    return;
  }

  for (const p of plan) {
    const s = src.collection(p.name);
    const d = dst.collection(p.name);
    if (replace && p.dstCount > 0) await d.drop();
    let done = 0;
    let batch: Record<string, unknown>[] = [];
    const flush = async () => {
      if (!batch.length) return;
      await d.insertMany(batch as never[], { ordered: false });
      done += batch.length;
      batch = [];
      process.stdout.write(`\r  ${p.name}: ${done}/${p.srcCount}`);
    };
    for await (const doc of s.find({}, { batchSize: BATCH })) {
      batch.push(doc as Record<string, unknown>);
      if (batch.length >= BATCH) await flush();
    }
    await flush();
    // indexes last (faster), skipping the default _id index
    for (const ix of await s.indexes()) {
      if (ix.name === "_id_") continue;
      const { key, v: _v, ns: _ns, ...opts } = ix as Record<string, unknown>;
      await d.createIndex(key as never, opts as never).catch((e) => console.log(`\n  index ${ix.name} skipped: ${(e as Error).message}`));
    }
    console.log(`\r  ${p.name}: ${done}/${p.srcCount} copied`);
  }
  console.log(`\nDone. Set MONGODB_URI to use database "${to}" (or MONGODB_DB=${to}).`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
