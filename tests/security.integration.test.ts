// Hardening checks against a real local MongoDB (database "souq_uae_test_sec"). Skipped if Mongo is down.
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT:${u}`); } }));
const cookieSets: { name: string; value: string; opts: Record<string, unknown> }[] = [];
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: (name: string, value: string, opts: Record<string, unknown>) => { cookieSets.push({ name, value, opts }); }, delete: () => {} }), headers: async () => new Headers() }));
let session: { id: string; email: string; name: string; role: "customer" | "owner" | "catalog_manager"; locale: "en" } | null = null;
// Keep the real createSession (it sets the cookie via the mocked next/headers); only fake who is "signed in".
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), getCurrentUser: async () => session }));
process.env.MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
process.env.MONGODB_DB = "souq_uae_test_sec";

const up = await mongoose.connect(process.env.MONGODB_URI, { dbName: "souq_uae_test_sec", serverSelectionTimeoutMS: 1500 }).then(() => true, () => false);
const S = up ? await import("@/lib/auth/session") : ({} as never);
const { User } = up ? await import("@/models/user") : ({} as never);
const Checkout = up ? await import("@/features/checkout/actions") : ({} as never);
const Csv = up ? await import("@/features/admin/csv/actions") : ({} as never);
const Cart = up ? await import("@/features/cart/actions") : ({} as never);
const Wish = up ? await import("@/features/wishlist/actions") : ({} as never);
const Rev = up ? await import("@/features/reviews/actions") : ({} as never);

beforeAll(async () => { if (!up) return; await mongoose.connection.dropDatabase(); await Promise.all([User.createIndexes(), (await import("@/models/session")).Session.createIndexes()]); });
afterAll(async () => { if (up) { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); } });
beforeEach(async () => { if (up) for (const c of await mongoose.connection.db!.collections()) await c.deleteMany({}); cookieSets.length = 0; });

describe.skipIf(!up)("sessions (real MongoDB)", () => {
  it("issues httpOnly SameSite=Lax cookies; staff sessions expire sooner than customer sessions", async () => {
    const cust = await User.create({ email: "c@t.test", name: "C", passwordHash: "x" });
    const owner = await User.create({ email: "o@t.test", name: "O", passwordHash: "x", role: "owner" });
    await S.createSession(String(cust._id)); await S.createSession(String(owner._id));
    const [c, o] = cookieSets;
    expect(c.opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(Number(o.opts.maxAge)).toBeLessThan(Number(c.opts.maxAge));
    expect(c.value).not.toBe(o.value);
    expect(c.value.length).toBeGreaterThan(40); // 256-bit random token
  });
  it("stores only a hash of the token, never the token itself", async () => {
    const u = await User.create({ email: "c@t.test", name: "C", passwordHash: "x" });
    await S.createSession(String(u._id));
    const row = (await mongoose.connection.db!.collection("sessions").findOne({}))!;
    expect(JSON.stringify(row)).not.toContain(cookieSets[0].value);
    expect(row.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe.skipIf(!up)("server actions tolerate hostile arguments (they are public endpoints)", () => {
  it("quote/coupon actions never throw on non-string input", async () => {
    session = { id: "64b000000000000000000001", email: "a@b.co", name: "A", role: "customer", locale: "en" };
    const weird: unknown[] = [{ $ne: "x" }, ["a"], 42, null, { toString: () => "x" }];
    for (const w of weird) {
      await expect(Checkout.quoteAction({ addressId: w as never, method: "cod", couponCode: w as never })).resolves.toMatchObject({ ok: false });
      await expect(Checkout.quoteAction(w as never)).resolves.toMatchObject({ ok: false });
      await expect(Checkout.checkCouponAction(w as never)).resolves.toMatchObject({ ok: false });
    }
  });
  it("cart, wishlist and review actions reject malformed ids", async () => {
    session = { id: "64b000000000000000000001", email: "a@b.co", name: "A", role: "customer", locale: "en" };
    for (const w of [{ $gt: "" }, ["x"], 1, null, "../../etc/passwd", "x".repeat(500)] as unknown[]) {
      expect((await Cart.addToCartAction(w as never, 1)).ok).toBe(false);
      expect((await Cart.setQtyAction(w as never, 1)).ok).toBe(false);
      expect((await Wish.toggleWishlistAction(w as never)).ok).toBe(false);
      expect((await Rev.toggleHelpfulAction(w)).ok).toBe(false);
      expect((await Rev.reportReviewAction(w, "spam")).ok).toBe(false);
    }
    expect((await Cart.addToCartAction("OK-SKU", 99999)).ok).toBe(false); // quantity bound
    expect((await Cart.addToCartAction("OK-SKU", 1.5)).ok).toBe(false);
  });
  it("CSV batch action rejects malformed payloads even for staff", async () => {
    session = { id: "64b000000000000000000002", email: "o@b.co", name: "O", role: "owner", locale: "en" };
    await User.create({ _id: session.id, email: "o@b.co", name: "O", role: "owner", passwordHash: "x" });
    for (const bad of [null, "str", [{ line: "x", data: {} }], Array.from({ length: 101 }, (_, i) => ({ line: i, data: { sku: "A" } })), [null]]) {
      expect((await Csv.importBatchAction("products", ["sku"], bad as never)).ok).toBe(false);
    }
    expect((await Csv.importBatchAction("products", "sku" as never, [])).ok).toBe(false);
    expect((await Csv.importBatchAction("users" as never, ["sku"], [])).ok).toBe(false);
    // __proto__ / unknown keys are dropped, not applied
    const r = await Csv.importBatchAction("products", ["sku", "__proto__"], [{ line: 2, data: { sku: "X-1", __proto__: "polluted", constructor: "x" } as never }]);
    expect(r.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
