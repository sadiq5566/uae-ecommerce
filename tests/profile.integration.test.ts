// Integration tests against a REAL local MongoDB (database "souq_uae_test_profile", wiped between tests). Skipped if Mongo is down.
// Covers the profile picture (upload / replace / remove / serve) and reviews open to any verified-email customer.
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const who = vi.hoisted(() => ({ user: null as null | { id: string; email: string; name: string; role: string; locale: string; emailVerified: boolean } }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => who.user, createSession: async () => {}, destroySession: async () => {}, destroyAllSessions: async () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "9.9.9.9" }), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, unstable_cache: (f: unknown) => f }));

process.env.MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
process.env.MONGODB_DB = "souq_uae_test_profile";
const up = await mongoose.connect(process.env.MONGODB_URI, { dbName: "souq_uae_test_profile", serverSelectionTimeoutMS: 1500 }).then(() => true, () => false);

const { POST, DELETE } = await import("@/app/api/account/avatar/route");
const { GET } = await import("@/app/avatars/[file]/route");
const { reviewEligibility } = await import("@/features/reviews/service");
const { Avatar } = await import("@/models/avatar");
const { Product } = await import("@/models/product");
const { RateLimit } = await import("@/models/rate-limit");
const { Review } = await import("@/models/review");
const { User } = await import("@/models/user");

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const upload = (bytes: Buffer | string, name = "a.jpg") => { const fd = new FormData(); fd.set("file", new File([bytes as BlobPart], name)); return POST(new Request("http://x/api/account/avatar", { method: "POST", body: fd })); };

describe.skipIf(!up)("profile picture and open reviews (real MongoDB)", () => {
  beforeAll(async () => { await mongoose.connection.dropDatabase(); await Promise.all([Avatar, User, Review, Product].map((m) => m.createIndexes())); }, 60_000);
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  let uid = "";
  beforeEach(async () => {
    for (const c of await mongoose.connection.db!.collections()) await c.deleteMany({});
    await RateLimit.deleteMany({});
    const u = await User.create({ email: "me@x.com", name: "Sara Ali", passwordHash: "x", emailVerifiedAt: new Date() });
    uid = String(u._id);
    who.user = { id: uid, email: "me@x.com", name: "Sara Ali", role: "customer", locale: "en", emailVerified: true };
  });

  it("stores the picture, serves it with the right type, and replacing it changes the version", async () => {
    const r1 = await upload(PNG, "me.png");
    expect(r1.status).toBe(200);
    const { url } = await r1.json();
    expect(url).toMatch(new RegExp(`^/avatars/${uid}\\.jpg\\?v=\\d+$`));
    const got = await GET(new Request("http://x" + url), { params: Promise.resolve({ file: `${uid}.jpg` }) });
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("image/png");
    expect(got.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await got.arrayBuffer()).equals(PNG)).toBe(true);
    const v1 = (await User.findById(uid).lean())!.avatarVersion!;
    await new Promise((r) => setTimeout(r, 5));
    expect((await upload(JPG)).status).toBe(200);
    const v2 = (await User.findById(uid).lean())!.avatarVersion!;
    expect(v2).toBeGreaterThan(v1);
    expect(await Avatar.countDocuments({ user: uid })).toBe(1); // replaced, not duplicated
    expect((await GET(new Request("http://x"), { params: Promise.resolve({ file: `${uid}.jpg` }) })).headers.get("content-type")).toBe("image/jpeg");
  });

  it("refuses non-images (even named .jpg), oversized files and signed-out visitors; removing clears it", async () => {
    expect((await upload("<svg onload=alert(1)></svg>", "x.svg")).status).toBe(400);
    expect((await upload("just text pretending", "x.jpg")).status).toBe(400);
    expect((await upload(Buffer.concat([JPG, Buffer.alloc(201 * 1024)]))).status).toBe(413);
    expect(await Avatar.countDocuments()).toBe(0);
    who.user = null;
    expect((await upload(PNG)).status).toBe(401);
    who.user = { id: uid, email: "me@x.com", name: "Sara", role: "customer", locale: "en", emailVerified: true };
    await upload(PNG);
    expect((await DELETE()).status).toBe(200);
    expect(await Avatar.countDocuments()).toBe(0);
    expect((await User.findById(uid).lean())!.avatarVersion).toBeUndefined();
    expect((await GET(new Request("http://x"), { params: Promise.resolve({ file: `${uid}.jpg` }) })).status).toBe(404);
    expect((await GET(new Request("http://x"), { params: Promise.resolve({ file: "../etc.jpg" }) })).status).toBe(404);
  });

  it("one customer can't overwrite another's picture", async () => {
    await upload(PNG);
    const other = await User.create({ email: "o@x.com", name: "Other", passwordHash: "x", emailVerifiedAt: new Date() });
    who.user = { id: String(other._id), email: "o@x.com", name: "Other", role: "customer", locale: "en", emailVerified: true };
    await upload(JPG);
    expect((await Avatar.findOne({ user: uid }).lean())!.contentType).toBe("image/png"); // mine is untouched
    expect((await Avatar.findOne({ user: other._id }).lean())!.contentType).toBe("image/jpeg");
  });

  it("any verified-email customer may review (no purchase needed); unverified ones may not", async () => {
    const p = await Product.create({ slug: "p", sku: "P", name: "P", category: "c", priceFrom: 10, priceTo: 10, stock: 1, status: "active" });
    expect((await reviewEligibility(uid, String(p._id))).state).toBe("can_review");
    const un = await User.create({ email: "un@x.com", name: "Un", passwordHash: "x" });
    expect((await reviewEligibility(String(un._id), String(p._id))).state).toBe("unverified");
    expect((await reviewEligibility(undefined, String(p._id))).state).toBe("guest");
    await Review.create({ product: p._id, user: uid, rating: 5, body: "Nice, no purchase needed", authorName: "S", verified: false, status: "pending" });
    expect((await reviewEligibility(uid, String(p._id))).state).toBe("already");
  });
});
