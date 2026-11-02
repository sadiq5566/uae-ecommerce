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

let tsx;
try { tsx = require.resolve("tsx/cli", { paths: [root] }); } catch { tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs"); }
const r = spawnSync(process.execPath, [tsx, ...files.map((f) => `--env-file=${f}`), ...process.argv.slice(2)], { stdio: "inherit", cwd: root });
process.exit(r.status ?? 1);
