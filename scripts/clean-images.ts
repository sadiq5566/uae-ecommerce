// Removes the source store's corner watermark from remote product images and re-hosts the cleaned copies in MongoDB (served at /api/images/<id>).
//
//   npm run clean-images                      dry run: downloads and analyses, writes nothing, changes nothing
//   npm run clean-images -- --limit=5         same, but only the first 5 products (quick test)
//   npm run clean-images -- --preview         also saves the cleaned files to scripts/clean-images.preview/ so you can look at them (DB untouched)
//   npm run clean-images -- --apply           stores cleaned images in MongoDB (served at /api/images/<id>) and updates the products
//   npm run clean-images -- --apply --public  same, but saves the files to public/uploads/ (served at /uploads/<id>.webp) instead of MongoDB
//   npm run clean-images -- --apply --limit=20
//
// How it cleans (see scripts/remove-watermark.py): watermarks are detected on the plain background wherever they are (any corner / edge / middle, any text or logo) and painted out. Pictures without a plain background are left as they are.
// Only URLs matching WATERMARK_URL_MATCH are touched. wristgallerydubai.shop images get the top-right "WG" logo reversed (scripts/remove-wg-logo.py); images cleaned by an earlier run from that host are re-cleaned from the original URL. Re-running is safe.
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { Product as ProductModel, ImageDoc } from "../lib/models";
import { WATERMARK, removeWatermark, type CleanResult } from "./watermark";

const CONFIG = {
  /** Only image URLs matching this regex are cleaned. Override in .env.local. */
  urlMatch: new RegExp(process.env.WATERMARK_URL_MATCH ?? String.raw`amaraswatches\.shop|wristgallerydubai\.shop|lunecollection\.shop|cdn\.shopify\.com`, "i"),
  concurrency: Number(process.env.WATERMARK_CONCURRENCY ?? 6),
  /** Images from these hosts carry the semi-transparent "WG" logo (top-right) -> removed with scripts/remove-wg-logo.py instead of the corner painter. */
  wgMatch: new RegExp(process.env.WG_URL_MATCH ?? String.raw`wristgallerydubai\.shop`, "i"),
  python: process.env.PYTHON ?? "python",
  maxBytes: 15 * 1024 * 1024,
  uploadsDir: path.join(process.cwd(), "public", "uploads"),
  previewDir: path.join(process.cwd(), "scripts", "clean-images.preview"),
  mapFile: path.join(process.cwd(), "scripts", "clean-images.map.json"),
};

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const preview = args.includes("--preview");
const toPublic = args.includes("--public");
const limit = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1]) || 0;

type Doc = { _id: unknown; images?: string[] };

async function download(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > CONFIG.maxBytes) throw new Error("file too large");
  return buf;
}

/** Reverses the WG logo overlay (top-right) with the Python/OpenCV script; image bytes in, cleaned webp out. */
function removeWgLogo(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const py = spawn(CONFIG.python, ["-I", path.join(process.cwd(), "scripts", "remove-wg-logo.py"), "--stdio"]);
    const out: Buffer[] = [];
    let err = "";
    py.stdout.on("data", (d) => out.push(d));
    py.stderr.on("data", (d) => (err += d));
    py.on("error", (e) => reject(new Error(`cannot run ${CONFIG.python}: ${e.message} (need python + opencv-python + numpy)`)));
    py.on("close", (code) => (code === 0 && out.length ? resolve(Buffer.concat(out)) : reject(new Error(`remove-wg-logo.py exit ${code}: ${err.trim().split("\n").pop()}`))));
    py.stdin.on("error", () => {});
    py.stdin.end(input);
  });
}

/** Runs `fn` over `items` with at most `n` in flight. */
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI must be set (.env.local)");
  await mongoose.connect(uri);

  // Images already replaced by an earlier run (/uploads/.., /api/images/..) that came from a WG-logo host are re-cleaned from the original URL.
  const prevMap: Record<string, string> = await readFile(CONFIG.mapFile, "utf8").then((t) => JSON.parse(t), () => ({}));
  const source = new Map(Object.entries(prevMap).filter(([orig]) => CONFIG.wgMatch.test(orig)).map(([orig, cleaned]) => [cleaned, orig]));
  const srcOf = (u: string) => source.get(u) ?? u;

  const found = ProductModel.find({ images: /^(https?:|\/uploads\/|\/api\/images\/)/ }).sort({ createdAt: 1 });
  const products = (await (limit ? found.limit(limit) : found).lean()) as unknown as Doc[];

  const wanted = (u?: string) => !!u && /^https?:/.test(u) && CONFIG.urlMatch.test(u);
  const urls = [...new Set(products.flatMap((p) => p.images ?? []).map(srcOf).filter(wanted))];
  console.log(`${products.length} product(s), ${urls.length} image(s) to check${apply ? " (APPLY)" : preview ? " (PREVIEW)" : " (DRY RUN)"}\n`);
  if (preview) await mkdir(CONFIG.previewDir, { recursive: true });
  if (apply && toPublic) await mkdir(CONFIG.uploadsDir, { recursive: true });

  const map: Record<string, string> = {}; // remote url -> /api/images/<id>
  const tally = { painted: 0, cropped: 0, noLogo: 0, skipped: 0, failed: 0 };
  let done = 0;

  await pool(urls, CONFIG.concurrency, async (url) => {
    // deterministic id (24 hex) so re-running never stores the same image twice
    const id = createHash("sha256").update(url).digest("hex").slice(0, 24);
    try {
      const raw = await download(url);
      const r: CleanResult = CONFIG.wgMatch.test(url) ? { status: "cleaned", method: "painted", buf: await removeWgLogo(raw) } : await removeWatermark(raw, WATERMARK);
      if (r.status === "cleaned") {
        if (apply && toPublic) await writeFile(path.join(CONFIG.uploadsDir, `${id}.webp`), r.buf);
        else if (apply) await ImageDoc.updateOne({ _id: id }, { $set: { data: r.buf, contentType: "image/webp", size: r.buf.length } }, { upsert: true });
        else if (preview) await writeFile(path.join(CONFIG.previewDir, `${id}.webp`), r.buf);
        map[url] = toPublic ? `/uploads/${id}.webp` : `/api/images/${id}`;
        if (r.method === "painted") tally.painted++;
        else tally.cropped++;
      } else if (r.status === "no-logo") tally.noLogo++;
      else { tally.skipped++; console.log(`  skipped: ${r.why} - ${url.slice(0, 100)}`); }
    } catch (e) {
      tally.failed++;
      console.log(`  failed: ${(e as Error).message} - ${url.slice(0, 100)}`);
    }
    if (++done % 25 === 0 || done === urls.length) console.log(`  ${done}/${urls.length}`);
  });

  let updated = 0;
  for (const p of products) {
    const images = (p.images ?? []).map((u) => map[srcOf(u)] ?? u);
    if (!images.some((u, i) => u !== p.images?.[i])) continue;
    updated++;
    if (apply) await ProductModel.updateOne({ _id: p._id }, { $set: { images } });
  }

  console.log(
    `\n${apply ? "APPLIED" : "DRY RUN"}: ${tally.painted} painted over, ${tally.cropped} cropped, ${tally.noLogo} had no watermark, ${tally.skipped} skipped, ${tally.failed} failed; ` +
      `${updated} product(s) ${apply ? "updated" : "would be updated"}.`,
  );
  if (apply && Object.keys(map).length) {
    await writeFile(CONFIG.mapFile, JSON.stringify({ ...prevMap, ...map }, null, 2));
    console.log(`Original -> cleaned URL map saved to ${path.relative(process.cwd(), CONFIG.mapFile)} (use it to roll back).`);
  }
  if (preview) console.log(`Cleaned files saved to ${path.relative(process.cwd(), CONFIG.previewDir)} - open a few and check.`);
  if (!apply) console.log("When it looks right run:  npm run clean-images -- --apply");
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
