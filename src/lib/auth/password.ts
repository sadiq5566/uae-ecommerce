import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

// scrypt (memory-hard, built into Node). Parameters follow OWASP guidance (N=2^17, r=8, p=1).
const N = 2 ** 17, r = 8, p = 1, KEYLEN = 64;
const MAXMEM = 256 * N * r;

const scrypt = (pw: string, salt: Buffer, opts: ScryptOptions) =>
  new Promise<Buffer>((res, rej) => scryptCb(pw, salt, KEYLEN, opts, (e, k) => (e ? rej(e) : res(k))));

/** Format: scrypt$N$r$p$saltB64$hashB64 — parameters are stored so they can be raised later. */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, { N, r, p, maxmem: MAXMEM });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

// Verified against when the account doesn't exist, so response time doesn't reveal which emails are registered.
let dummy: Promise<string> | undefined;

export async function verifyPassword(password: string, stored: string | undefined) {
  const hash = stored ?? (await (dummy ??= hashPassword("dummy-password-for-timing")));
  const [alg, n, rr, pp, salt, key] = hash.split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(key, "base64");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64"), { N: +n, r: +rr, p: +pp, maxmem: 256 * +n * +rr });
  return timingSafeEqual(actual, expected) && stored !== undefined;
}
