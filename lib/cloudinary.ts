import { createHash } from "crypto";

export const cloudinaryConfigured = () =>
  Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

const FOLDER = "cartsheaven/products";

function sign(params: Record<string, string | number>) {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(toSign + process.env.CLOUDINARY_API_SECRET).digest("hex");
}

/** Signature for direct browser uploads. The secret never leaves the server. */
export function uploadSignature() {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    timestamp,
    folder: FOLDER,
    signature: sign({ folder: FOLDER, timestamp }),
  };
}

/** Server-side re-upload of a remote image URL (used by the CSV importer). */
export async function uploadRemote(url: string): Promise<{ url: string; publicId: string }> {
  const timestamp = Math.floor(Date.now() / 1000);
  const form = new FormData();
  form.set("file", url);
  form.set("api_key", process.env.CLOUDINARY_API_KEY!);
  form.set("timestamp", String(timestamp));
  form.set("folder", FOLDER);
  form.set("signature", sign({ folder: FOLDER, timestamp }));
  const res = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? "Cloudinary upload failed");
  return { url: data.secure_url, publicId: data.public_id };
}
