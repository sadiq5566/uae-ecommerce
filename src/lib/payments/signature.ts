import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "x-signature";
export const TIMESTAMP_HEADER = "x-timestamp";
const TOLERANCE_MS = 5 * 60 * 1000;

/** HMAC-SHA256 over `${timestamp}.${rawBody}` (hex). Same scheme most gateways use. */
export const sign = (secret: string, timestamp: string, rawBody: string) =>
  createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");

export function verifySignature(secret: string, rawBody: string, signature: string | null, timestamp: string | null, now = Date.now()) {
  if (!secret || !signature || !timestamp) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > TOLERANCE_MS) return false; // replay protection
  const expected = Buffer.from(sign(secret, timestamp, rawBody), "hex");
  let given: Buffer;
  try { given = Buffer.from(signature, "hex"); } catch { return false; }
  return given.length === expected.length && timingSafeEqual(given, expected);
}
