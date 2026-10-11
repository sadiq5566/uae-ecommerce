// Phase 6 features against a real local MongoDB (database "souq_uae_test_p6"). Skipped if Mongo is down.
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let session: { id: string; email: string; name: string; role: "customer"; locale: "en" } | null = null;
const killed: string[] = []; const created: string[] = [];
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => session,
  destroyAllSessions: async (id: string) => { killed.push(id); },
  createSession: async (id: string) => { created.push(id); },
}));
process.env.MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
process.env.MONGODB_DB = "souq_uae_test_p6";

const up = await mongoose.connect(process.env.MONGODB_URI, { dbName: "souq_uae_test_p6", serverSelectionTimeoutMS: 1500 }).then(() => true, () => false);
const { suggest } = up ? await import("@/features/catalog/service") : ({} as never);
const { changePasswordAction } = up ? await import("@/features/account/actions") : ({} as never);
const { hashPassword, verifyPassword } = up ? await import("@/lib/auth/password") : ({} as never);
const { Product } = up ? await import("@/models/product") : ({} as never);
const { Category } = up ? await import("@/models/category") : ({} as never);
const { User } = up ? await import("@/models/user") : ({} as never);
const { RateLimit } = up ? await import("@/models/rate-limit") : ({} as never);

const L = (en: string, ar = en) => ({ en, ar });
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };

beforeAll(async () => { if (!up) return; await mongoose.connection.dropDatabase(); await Promise.all([Product.createIndexes(), Category.createIndexes(), User.createIndexes(), RateLimit.createIndexes()]); }, 60_000);
afterAll(async () => { if (!up) return; await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

describe.skipIf(!up)("search suggestions (real MongoDB)", () => {
  beforeEach(async () => {
    for (const c of await mongoose.connection.db!.collections()) await c.deleteMany({});
    const cat = await Category.create({ slug: "audio", name: L("Audio", "الصوتيات") });
    await Product.create([
      { slug: "aurora-headphones", sku: "AH-1", name: L("Aurora Wireless Headphones", "سماعات أورورا"), brand: "Aurora", category: cat._id, price: 100, stock: 5, status: "published", soldCount: 10 },
      { slug: "pulse-speaker", sku: "PS-1", name: L("Pulse Speaker", "سماعة بلس"), category: cat._id, price: 50, stock: 5, status: "published" },
      { slug: "hidden-draft", sku: "HD-1", name: L("Headphones Draft", "مسودة"), category: cat._id, price: 10, stock: 5, status: "draft" },
    ]);
  });

  it("ignores very short queries and never returns unpublished products", async () => {
    expect(await suggest("h")).toEqual([]);
    expect(await suggest("   ")).toEqual([]);
    const r = await suggest("headphones");
    expect(r.map((x) => x.slug)).toEqual(["aurora-headphones"]);
  });
  it("matches whole words, word prefixes, brands, SKUs and Arabic", async () => {
    expect((await suggest("wire")).some((x) => x.slug === "aurora-headphones")).toBe(true); // prefix of a word
    expect((await suggest("Aurora")).some((x) => x.slug === "aurora-headphones")).toBe(true);
    expect((await suggest("PS-")).some((x) => x.slug === "pulse-speaker")).toBe(true);
    expect((await suggest("سماعات")).some((x) => x.slug === "aurora-headphones")).toBe(true);
  });
  it("suggests matching categories and respects the limit", async () => {
    const r = await suggest("aud", 6);
    expect(r[0]).toMatchObject({ type: "category", slug: "audio" });
    expect((await suggest("pulse", 1)).length).toBe(1);
  });
  it("treats regex metacharacters as plain text (no injection / errors)", async () => {
    for (const q of [".*", "(", "[a-", "\\", "a|b", "$where"]) expect(await suggest(q)).toEqual([]);
  });
});

describe.skipIf(!up)("change password (real MongoDB)", () => {
  beforeEach(async () => {
    for (const c of await mongoose.connection.db!.collections()) await c.deleteMany({});
    killed.length = 0; created.length = 0;
    const u = await User.create({ email: "cp@t.test", name: "CP", passwordHash: await hashPassword("old-password-123") });
    session = { id: String(u._id), email: u.email, name: u.name, role: "customer", locale: "en" };
  });

  it("requires sign-in", async () => {
    session = null;
    expect(await changePasswordAction({}, fd({ current: "x", password: "a-new-password-1" }))).toMatchObject({ error: "auth" });
  });
  it("validates the new password and the current one", async () => {
    expect((await changePasswordAction({}, fd({ current: "old-password-123", password: "short" }))).fieldErrors?.password).toBe("password_short");
    expect((await changePasswordAction({}, fd({ current: "WRONG-password", password: "a-new-password-1" }))).fieldErrors?.current).toBe("password_wrong");
    expect((await changePasswordAction({}, fd({ current: "old-password-123", password: "old-password-123" }))).fieldErrors?.password).toBe("password_same");
    expect(killed).toHaveLength(0);
  });
  it("updates the hash, signs out every session, and starts a fresh one for this device", async () => {
    expect(await changePasswordAction({}, fd({ current: "old-password-123", password: "a-new-password-1" }))).toMatchObject({ ok: true });
    const u = (await User.findOne({ email: "cp@t.test" }).select("+passwordHash"))!;
    expect(await verifyPassword("a-new-password-1", u.passwordHash)).toBe(true);
    expect(await verifyPassword("old-password-123", u.passwordHash)).toBe(false);
    expect(killed).toEqual([String(u._id)]);
    expect(created).toEqual([String(u._id)]);
  });
  it("is rate limited against guessing the current password", async () => {
    for (let i = 0; i < 5; i++) await changePasswordAction({}, fd({ current: "nope-nope-nope", password: "a-new-password-1" }));
    expect(await changePasswordAction({}, fd({ current: "old-password-123", password: "a-new-password-1" }))).toMatchObject({ error: "rate_limited" });
  });
});
