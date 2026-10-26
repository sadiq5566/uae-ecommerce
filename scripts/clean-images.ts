// Removes the source store's corner watermark from remote product images and re-hosts the cleaned copies in MongoDB (served at /api/images/<id>).
//
//   npm run clean-images                      dry run: downloads and analyses, writes nothing, changes nothing
//   npm run clean-images -- --limit=5         same, but only the first 5 products (quick test)
//   npm run clean-images -- --preview         also saves the cleaned files to scripts/clean-images.preview/ so you can look at them (DB untouched)
//   npm run clean-images -- --apply           stores cleaned images in MongoDB (served at /api/images/<id>) and updates the products
//   npm run clean-images -- --apply --public  same, but saves the files to public/uploads/ (served at /uploads/<id>.webp) instead of MongoDB
//   npm run clean-images -- --apply --limit=20
//   npm run clean-images -- --apply --local   ALSO cleans images already stored in public/uploads/ (most of the catalogue); cleaned copies get new file names, the products are re-pointed, the old files stay for rollback
//
// How it cleans: the four known logos - Rimal (bottom-left), Amara + Lune (bottom-right), WG (top-right) - are found by template on any background, photos included, and painted out (scripts/remove-logos.py, artwork in scripts/logo-templates/).
// Then any other watermark on a plain background is detected and painted out (scripts/remove-watermark.py). Pictures with no known logo and no plain background are left as they are.
// Only URLs matching WATERMARK_URL_MATCH are touched. Images cleaned by an earlier run from the WG host are re-cleaned from the original URL. Re-running is safe.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { ImageDoc } from "../lib/models/ImageDoc";
import { WATERMARK, removeWatermark, type CleanResult } from "./watermark";
import { closeWatermarkWorkers } from "../lib/watermark-remove";

const CONFIG = {
  /** Only image URLs matching this regex are cleaned. Override in the env file. */
  urlMatch: new RegExp(process.env.WATERMARK_URL_MATCH ?? String.raw`amaraswatches\.shop|wristgallerydubai\.shop|lunecollection\.shop|cdn\.shopify\.com|rimal\.club`, "i"),
  concurrency: Number(process.env.WATERMARK_CONCURRENCY ?? 6),
  /** Images from these hosts carry the semi-transparent "WG" logo (top-right); ones cleaned by an earlier run are re-cleaned from the original URL. */
  wgMatch: new RegExp(process.env.WG_URL_MATCH ?? String.raw`wristgallerydubai\.shop`, "i"),
  maxBytes: 15 * 1024 * 1024,
  uploadsDir: path.join(process.cwd(), "public", "uploads"),
  previewDir: path.join(process.cwd(), "scripts", "clean-images.preview"),
  mapFile: path.join(process.cwd(), "scripts", "clean-images.map.json"),
};

const args = process.argv.slice(2);
const apply = args.includes("--apply") || process.env.npm_config_apply === "true"; // npm swallows a flag given without "--"
const preview = args.includes("--preview");
const local = args.includes("--local"); // also clean /uploads/<id>.webp images already in the catalogue
const toPublic = args.includes("--public") || local;
const limit = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1]) || 0;

type Img = { url: string; alt?: string; publicId?: string };
type Variant = { image?: string; [k: string]: unknown };
type Doc = { _id: unknown; images?: Img[]; variants?: Variant[] };

async function download(url: string) {
  if (url.startsWith("/uploads/")) return readFile(path.join(CONFIG.uploadsDir, path.basename(url)));
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > CONFIG.maxBytes) throw new Error("file too large");
  return buf;
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
  if (!uri) throw new Error("MONGODB_URI must be set");
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || undefined });

  // Images already replaced by an earlier run (/uploads/.., /api/images/..) that came from a WG-logo host are re-cleaned from the original URL.
  const prevMap: Record<string, string> = await readFile(CONFIG.mapFile, "utf8").then((t) => JSON.parse(t), () => ({}));
  const source = new Map(Object.entries(prevMap).filter(([orig]) => CONFIG.wgMatch.test(orig)).map(([orig, cleaned]) => [cleaned, orig]));
  const srcOf = (u: string) => source.get(u) ?? u;

  // The storefront's products live in the `products` collection with images as { url, alt, publicId } objects.
  const col = mongoose.connection.collection("products");
  const found = col.find({ "images.url": /^(https?:|\/uploads\/|\/api\/images\/)/ }).sort({ createdAt: 1 });
  const products = (await (limit ? found.limit(limit) : found).toArray()) as unknown as Doc[];

  const wanted = (u?: string) => !!u && ((/^https?:/.test(u) && CONFIG.urlMatch.test(u)) || (local && /^\/uploads\/[a-f0-9]{24}\.(webp|png|jpg)$/.test(u)));
  // Colour / size variants can carry their own photo (variants[].image): those are cleaned and re-pointed too.
  const urls = [...new Set(products.flatMap((p) => [...(p.images ?? []).map((i) => i.url), ...(p.variants ?? []).map((v) => v.image ?? "")]).map(srcOf).filter(wanted))];
  console.log(`${products.length} product(s), ${urls.length} image(s) to check${apply ? " (APPLY)" : preview ? " (PREVIEW)" : " (DRY RUN)"}\n`);
  if (preview) await mkdir(CONFIG.previewDir, { recursive: true });
  if (apply && toPublic) await mkdir(CONFIG.uploadsDir, { recursive: true });

  const map: Record<string, string> = {}; // remote url -> /api/images/<id>
  const tally = { painted: 0, cropped: 0, noLogo: 0, skipped: 0, gone: 0, absent: 0, failed: 0 };
  const skipReasons = new Map<string, number>();
  const verbose = args.includes("--verbose"); // list every skipped picture instead of just counting them
  const absent: string[] = []; // /uploads files the database lists but that are not in public/uploads on THIS machine
  const gone: string[] = []; // source URLs that no longer exist (HTTP 404/410): nothing to clean, the product keeps its old URL
  let done = 0;

  await pool(urls, CONFIG.concurrency, async (url) => {
    // deterministic id (24 hex) so re-running never stores the same image twice
    const id = createHash("sha256").update(url).digest("hex").slice(0, 24);
    try {
      const raw = await download(url);
      const r: CleanResult = await removeWatermark(raw, WATERMARK);
      if (r.status === "cleaned") {
        if (apply && toPublic) await writeFile(path.join(CONFIG.uploadsDir, `${id}.webp`), r.buf);
        else if (apply) await ImageDoc.updateOne({ _id: id }, { $set: { data: r.buf, contentType: "image/webp", size: r.buf.length } }, { upsert: true });
        else if (preview) await writeFile(path.join(CONFIG.previewDir, `${id}.webp`), r.buf);
        map[url] = toPublic ? `/uploads/${id}.webp` : `/api/images/${id}`;
        if (r.method === "painted") tally.painted++;
        else tally.cropped++;
      } else if (r.status === "no-logo") tally.noLogo++;
      else {
        // A photo (or any picture without a plain corner) cannot be painted over without smudging the product, so it is left exactly as it is.
        tally.skipped++;
        const why = /too large|plain|touches/i.test(r.why) ? "photo / busy background - nothing safe to paint over, left as is" : r.why;
        skipReasons.set(why, (skipReasons.get(why) ?? 0) + 1);
        if (verbose) console.log(`  skipped: ${why} - ${url.slice(0, 100)}`);
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (/^HTTP (404|410)$/.test(msg)) { tally.gone++; gone.push(url); }
      else if (url.startsWith("/uploads/") && /ENOENT/.test(msg)) { tally.absent++; absent.push(url); }
      else { tally.failed++; console.log(`  failed: ${msg} - ${url.slice(0, 100)}`); }
    }
    if (++done % 25 === 0 || done === urls.length) console.log(`  ${done}/${urls.length}`);
  });

  let updated = 0;
  for (const p of products) {
    const images = (p.images ?? []).map((i) => ({ ...i, url: map[srcOf(i.url)] ?? i.url }));
    const variants = (p.variants ?? []).map((v) => (v.image && map[srcOf(v.image)] ? { ...v, image: map[srcOf(v.image)] } : v));
    const imagesChanged = images.some((i, k) => i.url !== p.images?.[k]?.url);
    const variantsChanged = variants.some((v, k) => v !== (p.variants ?? [])[k]);
    if (!imagesChanged && !variantsChanged) continue;
    updated++;
    if (apply) await col.updateOne({ _id: p._id } as never, { $set: { ...(imagesChanged && { images }), ...(variantsChanged && { variants }) } });
  }

  console.log(
    `\n${apply ? "APPLIED" : "DRY RUN"}: ${tally.painted} painted over, ${tally.cropped} cropped, ${tally.noLogo} had no watermark, ${tally.skipped} skipped, ${tally.gone} gone at source (404), ${tally.absent} not on this machine, ${tally.failed} failed; ` +
      `${updated} product(s) ${apply ? "updated" : "would be updated"}.`,
  );
  for (const [why, n] of skipReasons) console.log(`${n} skipped: ${why}`);
  if (absent.length) {
    await writeFile(path.join(process.cwd(), "scripts", "clean-images.absent.txt"), absent.join("\n") + "\n");
    console.log(`${absent.length} /uploads image(s) are listed in the database but are not in public/uploads on this machine (listed in scripts/clean-images.absent.txt).`);
    console.log("  Copy the server's public/uploads folder here (or run this script on the server that has the files); they could not be cleaned and will also show as broken images on this machine.");
  }
  if (gone.length) {
    await writeFile(path.join(process.cwd(), "scripts", "clean-images.gone.txt"), gone.join("\n") + "\n");
    console.log(`${gone.length} image URL(s) no longer exist at the source; listed in scripts/clean-images.gone.txt (re-upload or remove them in the admin).`);
  }
  if (apply && Object.keys(map).length) {
    await writeFile(CONFIG.mapFile, JSON.stringify({ ...prevMap, ...map }, null, 2));
    console.log(`Original -> cleaned URL map saved to ${path.relative(process.cwd(), CONFIG.mapFile)} (use it to roll back).`);
  }
  if (preview) console.log(`Cleaned files saved to ${path.relative(process.cwd(), CONFIG.previewDir)} - open a few and check.`);
  if (!apply) console.log("When it looks right run:  npm run clean-images -- --apply");
  closeWatermarkWorkers();
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
