// Removes the source store's corner logo ("AMARA WATCHES") from remote product images and re-hosts the cleaned copy in public/uploads.
// Usage:  npm run clean-images            (dry run: reports what it would do)
//         npm run clean-images -- --apply (writes cleaned files + updates products)
// Only edits images whose logo sits on a plain, uniform background in the bottom-right corner; anything else is skipped and reported.
// Development storage only (public/uploads). For production, upload the cleaned files to your real image storage.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import sharp from "sharp";
import { Product } from "../src/models/product";
import { isAllowedImageUrl } from "../src/lib/image-url";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB ?? "souq_uae_dev";
const apply = process.argv.includes("--apply");

// Where to look for the logo (fractions of the image) and how big it may be before we assume it's not a logo.
const SEARCH = { x0: 0.68, x1: 1, y0: 0.88, y1: 1 };
const MAX_BOX = { w: 0.4, h: 0.14 };
const TOLERANCE = 14; // per-channel difference from the background that counts as "ink"
const PAD = 8;

type Result = { status: "cleaned"; buf: Buffer } | { status: "no-logo" } | { status: "skipped"; why: string };

async function clean(input: Buffer): Promise<Result> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const at = (x: number, y: number) => (y * W + x) * 4;
  const sx0 = Math.floor(W * SEARCH.x0), sx1 = W - 1, sy0 = Math.floor(H * SEARCH.y0), sy1 = H - 1;

  // Background = median colour of the search strip's outer edge (right/bottom border rows), which is empty in these photos.
  const sample: number[][] = [[], [], []];
  for (let x = sx0; x <= sx1; x += 3) for (const y of [sy1, sy1 - 1, sy1 - 2, sy0]) for (let c = 0; c < 3; c++) sample[c].push(data[at(x, y) + c]);
  for (let y = sy0; y <= sy1; y += 3) for (const x of [sx1, sx1 - 1, sx1 - 2]) for (let c = 0; c < 3; c++) sample[c].push(data[at(x, y) + c]);
  const med = sample.map((s) => s.sort((a, b) => a - b)[s.length >> 1]);
  const spread = sample.map((s) => s[Math.floor(s.length * 0.9)] - s[Math.floor(s.length * 0.1)]);
  if (Math.max(...spread) > 18) return { status: "skipped", why: "background around the logo isn't uniform" };

  let minX = W, minY = H, maxX = -1, maxY = -1, ink = 0;
  for (let y = sy0; y <= sy1; y++) for (let x = sx0; x <= sx1; x++) {
    const i = at(x, y);
    if (Math.abs(data[i] - med[0]) > TOLERANCE || Math.abs(data[i + 1] - med[1]) > TOLERANCE || Math.abs(data[i + 2] - med[2]) > TOLERANCE) {
      ink++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (ink < 40) return { status: "no-logo" };
  if (maxX - minX > W * MAX_BOX.w || maxY - minY > H * MAX_BOX.h) return { status: "skipped", why: "marked area is too large to be just the logo" };
  // The ink must not touch the edges of the search strip's top/left (that would mean the picture's subject runs into it).
  if (minX <= sx0 + 1 || minY <= sy0 + 1) return { status: "skipped", why: "marked area touches the search boundary (subject nearby)" };

  const x0 = Math.max(0, minX - PAD), x1 = Math.min(W - 1, maxX + PAD), y0 = Math.max(0, minY - PAD), y1 = Math.min(H - 1, maxY + PAD);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = at(x, y); data[i] = med[0]; data[i + 1] = med[1]; data[i + 2] = med[2]; }
  return { status: "cleaned", buf: await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer() };
}

async function download(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 15 * 1024 * 1024) throw new Error("file too large");
  return buf;
}

async function main() {
  if (!uri) throw new Error("MONGODB_URI must be set");
  await mongoose.connect(uri, { dbName, autoIndex: false });
  const outDir = path.join(process.cwd(), "public", "uploads");
  if (apply) await mkdir(outDir, { recursive: true });

  const products = await Product.find({ $or: [{ "images.url": /^https:/ }, { "variants.image": /^https:/ }] }).lean();
  const cache = new Map<string, string | null>(); // remote url → new /uploads url (null = leave as is)
  const map: Record<string, string> = {};
  const tally = { cleaned: 0, noLogo: 0, skipped: 0, failed: 0 };

  async function resolve(url: string): Promise<string> {
    if (!url.startsWith("https://") || !isAllowedImageUrl(url)) return url;
    if (cache.has(url)) return cache.get(url) ?? url;
    let out: string | null = null;
    try {
      const r = await clean(await download(url));
      if (r.status === "cleaned") {
        const name = `${createHash("sha256").update(url).digest("hex").slice(0, 24)}.png`;
        if (apply) await writeFile(path.join(outDir, name), r.buf);
        out = `/uploads/${name}`; map[url] = out; tally.cleaned++;
      } else if (r.status === "no-logo") tally.noLogo++;
      else { tally.skipped++; console.log(`  skipped: ${r.why} — ${url.slice(0, 90)}`); }
    } catch (e) { tally.failed++; console.log(`  failed: ${(e as Error).message} — ${url.slice(0, 90)}`); }
    cache.set(url, out);
    return out ?? url;
  }

  let updated = 0;
  for (const p of products) {
    const images = [];
    for (const im of p.images ?? []) images.push({ ...im, url: await resolve(im.url ?? "") });
    const variants = [];
    for (const v of p.variants ?? []) variants.push({ ...v, image: v.image ? await resolve(v.image) : v.image });
    const changed = images.some((im, i) => im.url !== p.images?.[i]?.url) || variants.some((v, i) => v.image !== p.variants?.[i]?.image);
    if (changed) { updated++; if (apply) await Product.updateOne({ _id: p._id }, { $set: { images, variants } }); }
    console.log(`${changed ? "✔" : "·"} ${p.sku}`);
  }
  console.log(`\n${apply ? "APPLIED" : "DRY RUN"}: ${tally.cleaned} image(s) cleaned, ${tally.noLogo} had no logo, ${tally.skipped} skipped, ${tally.failed} failed; ${updated} product(s) ${apply ? "updated" : "would be updated"}.`);
  if (apply && Object.keys(map).length) {
    await writeFile(path.join(process.cwd(), "scripts", "clean-images.map.json"), JSON.stringify(map, null, 2));
    console.log("Original → cleaned URL map saved to scripts/clean-images.map.json (use it to roll back).");
  }
  if (!apply) console.log("Run again with:  npm run clean-images -- --apply");
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
