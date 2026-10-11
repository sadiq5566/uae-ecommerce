import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Object-storage abstraction. Product/category/article images are stored as URLs, never as binaries in MongoDB.
 * `local` (development only) writes to public/uploads. For production add an adapter (S3 / R2 / Cloudinary / Vercel Blob)
 * implementing `ImageStorage` and select it with STORAGE_DRIVER.
 */
export interface ImageStorage { put(data: Buffer, ext: "png" | "jpg" | "webp"): Promise<{ url: string }>; }

const local: ImageStorage = {
  async put(data, ext) {
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    const name = `${randomBytes(12).toString("hex")}.${ext}`;
    await writeFile(path.join(dir, name), data);
    return { url: `/uploads/${name}` };
  },
};

export function getStorage(): ImageStorage | null {
  const driver = process.env.STORAGE_DRIVER ?? (process.env.NODE_ENV === "production" ? "" : "local");
  if (driver === "local" && process.env.NODE_ENV !== "production") return local;
  // if (driver === "s3") return s3Storage; …
  return null;
}

/** Detect the real image type from magic bytes (never trust the filename or Content-Type). */
export function sniffImage(buf: Buffer): "png" | "jpg" | "webp" | null {
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export { imageHosts, isAllowedImageUrl } from "./image-url";
