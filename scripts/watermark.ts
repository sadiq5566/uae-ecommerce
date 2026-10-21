// Core of `npm run clean-images`. removeWatermark() first runs the generic detector (lib/watermark-remove.ts -> scripts/remove-watermark.py):
// finds watermark(s) anywhere (any corner/edge/middle, any wording) on a plain background and paints them out.
// If Python/OpenCV isn't available it falls back to the old fixed-corner painter below (bottom-right by default, tune via WATERMARK_* env).
import sharp from "sharp";
import { removeAnyWatermark } from "../lib/watermark-remove";

/**
 * Where the watermark is and how to recognise it. All positions are fractions of the image (0 = left/top, 1 = right/bottom).
 * Tuned for the "LUNE · MAISON DUBAI" mark that sits in the bottom-right corner of the lunecollection.shop pictures.
 * Every value can be overridden from .env.local, e.g. WATERMARK_X0=0.7 (restart not needed, scripts read it on start).
 */
const env = (k: string, d: number) => (process.env[k] && Number.isFinite(Number(process.env[k])) ? Number(process.env[k]) : d);

export const WATERMARK = {
  /** Search window. The mark must be fully inside it. */
  x0: env("WATERMARK_X0", 0.72),
  x1: env("WATERMARK_X1", 1),
  y0: env("WATERMARK_Y0", 0.9),
  y1: env("WATERMARK_Y1", 1),
  /** Largest size the mark may have (fraction of the image). Bigger "ink" than this is a product, not a watermark -> skip. */
  maxW: env("WATERMARK_MAX_W", 0.4),
  maxH: env("WATERMARK_MAX_H", 0.14),
  /** A pixel counts as watermark "ink" when any channel differs from the background by more than this. The mark is faint, so keep it low. */
  tolerance: env("WATERMARK_TOLERANCE", 10),
  /** The background in the window must be this flat (0-255 spread). Higher = also clean busier backgrounds, but riskier. */
  maxBackgroundSpread: env("WATERMARK_MAX_SPREAD", 22),
  /** Extra pixels painted around the detected mark so its soft anti-aliased edge is gone too. */
  pad: env("WATERMARK_PAD", 10),
  /** Fewer ink pixels than this = no watermark on this picture. */
  minInkPixels: env("WATERMARK_MIN_INK", 40),
  /**
   * Fallback for pictures whose corner is NOT a plain colour (photos, gradients), where painting over would leave a smudge:
   * keep only the top part of the picture and cut the strip that holds the mark. 0.9 = keep the top 90%. Use 1 to disable the fallback.
   */
  cropKeep: env("WATERMARK_CROP_KEEP", 0.9),
};

export type CleanResult =
  | { status: "cleaned"; buf: Buffer; method: "painted" | "cropped" }
  | { status: "no-logo" }
  | { status: "skipped"; why: string };

/** Generic removal (any position / any watermark). A picture whose background isn't plain comes back "skipped" and stays untouched. */
export async function removeWatermark(input: Buffer, cfg = WATERMARK): Promise<CleanResult> {
  try {
    const r = await removeAnyWatermark(input);
    return r.status === "cleaned" ? { status: "cleaned", buf: r.buf, method: "painted" } : r;
  } catch (e) {
    if (!warned) { warned = true; console.warn(`  generic watermark remover unavailable (${(e as Error).message}); using the fixed bottom-right corner painter`); }
    return removeCornerWatermark(input, cfg);
  }
}
let warned = false;

/** Old fixed-window fallback: paints over the mark when the corner is a plain colour; otherwise cuts the bottom strip (cfg.cropKeep) so no smudge is left. */
export async function removeCornerWatermark(input: Buffer, cfg = WATERMARK): Promise<CleanResult> {
  const painted = await paintOver(input, cfg);
  if (painted.status !== "skipped" || cfg.cropKeep >= 1) return painted;
  const img = sharp(input).rotate();
  const { width = 0, height = 0 } = await img.metadata();
  const h = Math.floor(height * cfg.cropKeep);
  if (!width || h < 50) return painted;
  return { status: "cleaned", method: "cropped", buf: await img.extract({ left: 0, top: 0, width, height: h }).webp({ quality: 92 }).toBuffer() };
}

async function paintOver(input: Buffer, cfg: typeof WATERMARK): Promise<CleanResult> {
  const { data, info } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const at = (x: number, y: number) => (y * W + x) * 4;
  const sx0 = Math.floor(W * cfg.x0), sx1 = Math.min(W - 1, Math.ceil(W * cfg.x1) - 1);
  const sy0 = Math.floor(H * cfg.y0), sy1 = Math.min(H - 1, Math.ceil(H * cfg.y1) - 1);

  // Background = median colour of the window's outer border (right / bottom edge rows), which these photos leave empty.
  const sample: number[][] = [[], [], []];
  for (let x = sx0; x <= sx1; x += 3) for (const y of [sy1, sy1 - 1, sy1 - 2, sy0]) for (let c = 0; c < 3; c++) sample[c].push(data[at(x, y) + c]);
  for (let y = sy0; y <= sy1; y += 3) for (const x of [sx1, sx1 - 1, sx1 - 2]) for (let c = 0; c < 3; c++) sample[c].push(data[at(x, y) + c]);
  const med = sample.map((s) => [...s].sort((a, b) => a - b)[s.length >> 1]);
  const spread = sample.map((s) => { const v = [...s].sort((a, b) => a - b); return v[Math.floor(v.length * 0.9)] - v[Math.floor(v.length * 0.1)]; });
  if (Math.max(...spread) > cfg.maxBackgroundSpread) return { status: "skipped", why: "background around the corner isn't plain" };

  let minX = W, minY = H, maxX = -1, maxY = -1, ink = 0;
  for (let y = sy0; y <= sy1; y++) for (let x = sx0; x <= sx1; x++) {
    const i = at(x, y);
    if (Math.abs(data[i] - med[0]) > cfg.tolerance || Math.abs(data[i + 1] - med[1]) > cfg.tolerance || Math.abs(data[i + 2] - med[2]) > cfg.tolerance) {
      ink++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (ink < cfg.minInkPixels) return { status: "no-logo" };
  if (maxX - minX > W * cfg.maxW || maxY - minY > H * cfg.maxH) return { status: "skipped", why: "marked area is too large to be just a watermark" };
  // Ink touching the top/left of the window means the product itself runs into the corner.
  if (minX <= sx0 + 1 || minY <= sy0 + 1) return { status: "skipped", why: "marked area touches the search window (product nearby)" };

  const x0 = Math.max(0, minX - cfg.pad), x1 = Math.min(W - 1, maxX + cfg.pad);
  const y0 = Math.max(0, minY - cfg.pad), y1 = Math.min(H - 1, maxY + cfg.pad);

  // Paint over the box by blending the clean pixels just outside each of its sides (follows gradients, unlike a flat fill).
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const src: [number, number][] = [];
    if (x0 > 0) src.push([at(x0 - 1, y), x - x0 + 1]);
    if (x1 < W - 1) src.push([at(x1 + 1, y), x1 - x + 1]);
    if (y0 > 0) src.push([at(x, y0 - 1), y - y0 + 1]);
    if (y1 < H - 1) src.push([at(x, y1 + 1), y1 - y + 1]);
    let wSum = 0;
    const acc = [0, 0, 0];
    for (const [idx, dist] of src) {
      const w = 1 / dist;
      wSum += w;
      for (let c = 0; c < 3; c++) acc[c] += data[idx + c] * w;
    }
    const i = at(x, y);
    for (let c = 0; c < 3; c++) data[i + c] = wSum ? Math.round(acc[c] / wSum) : med[c];
  }
  const buf = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 92 }).toBuffer();
  return { status: "cleaned", buf, method: "painted" };
}
