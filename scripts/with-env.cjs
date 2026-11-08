#!/usr/bin/env node
// Runs a TypeScript script (via tsx) with whichever env files this project has:
//   .env        (production servers usually have only this one)
//   .env.local  (a developer's PC; loaded after .env, so it wins, same order as Next.js)
// Only the files that exist are passed, so the same command works on your PC and on the server. Variables already set in the real
// environment (pm2, shell) are never overridden. Usage:  node scripts/with-env.cjs scripts/<name>.ts [script arguments]
const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = process.cwd();
const files = [".env", ".env.local"].filter((f) => existsSync(path.join(root, f)));
if (!files.length) console.warn("[env] no .env or .env.local file here: using the environment variables as they are");
else console.log(`[env] loading ${files.join(" + ")}`);

// --- shared database guard -------------------------------------------------------------------------------------------------
// While USE_SHARED_DB is not "true", maintenance scripts keep working on this store's OLD database (OLD_MONGODB_URI / OLD_MONGODB_DB), exactly like
// the running site, so a stray `npm run seed` or `db:seo-fix` can never write into the shared database by accident. The migration and index scripts
// are the only ones that deliberately talk to the shared database (MONGODB_URI / MONGODB_DB), so they are left alone.
const fromFiles = {};
for (const f of files) {
  for (const line of require("node:fs").readFileSync(path.join(root, f), "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) fromFiles[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const pick = (k) => process.env[k] ?? fromFiles[k];
const script = process.argv[2] ?? "";
const sharedTool = /(^|[\\/])(migrate-[a-z]+|indexes)\.ts$/.test(script);
const childEnv = { ...process.env };
if (!/^(1|true|yes|on)$/i.test(pick("USE_SHARED_DB") ?? "") && pick("OLD_MONGODB_URI") && !sharedTool) {
  childEnv.MONGODB_URI = pick("OLD_MONGODB_URI");
  childEnv.MONGODB_DB = pick("OLD_MONGODB_DB") ?? "";
  console.log("[env] USE_SHARED_DB is off: using the old database" + (childEnv.MONGODB_DB ? ` "${childEnv.MONGODB_DB}"` : ""));
}

let tsx;
try { tsx = require.resolve("tsx/cli", { paths: [root] }); } catch { tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs"); }
const r = spawnSync(process.execPath, [tsx, ...files.map((f) => `--env-file=${f}`), ...process.argv.slice(2)], { stdio: "inherit", cwd: root, env: childEnv });
process.exit(r.status ?? 1);
