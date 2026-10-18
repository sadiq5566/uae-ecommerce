// No server-only import: pure helpers shared by validators and tests.
/** Allowed hosts for remote image URLs (CSV import, manual URL entry). Comma-separated in IMAGE_HOSTS. Local /uploads paths are always allowed. */
export function imageHosts() {
  return (process.env.IMAGE_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
}
export function isAllowedImageUrl(u: string) {
  if (/^\/uploads\/[a-f0-9]{24}\.(png|jpg|webp)$/.test(u)) return true;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && imageHosts().includes(url.hostname.toLowerCase());
  } catch { return false; }
}

/** Substrings (case-insensitive, comma-separated in IMAGE_BLOCKLIST) of image URLs that must never be imported, e.g. "Screenshot_" for stray screenshots. */
export function isBlockedImage(u: string) {
  const words = (process.env.IMAGE_BLOCKLIST ?? "").split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
  const low = u.toLowerCase();
  return words.some((w) => low.includes(w));
}
