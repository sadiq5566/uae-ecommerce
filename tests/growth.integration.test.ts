// Integration tests against a REAL local MongoDB (database "souq_uae_test_growth", wiped between tests). Skipped if Mongo is down.
// Covers the growth features: abandoned-cart reminders, back-in-stock alerts, review requests + thank-you coupon, and referrals.
import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const sent: { to: string; subject: string; text: string; html?: string }[] = [];
let mailWorks = true;
vi.mock("@/lib/mailer", () => ({ getMailer: () => ({ send: async (m: { to: string; subject: string; text: string }) => { if (mailWorks) sent.push(m); return { sent: mailWorks }; } }) }));
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined), set: (k: string, v: string) => { jar.set(k, v); }, delete: (k: string) => { jar.delete(k); } }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, unstable_cache: (f: unknown) => f }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT:${u}`); } }));

process.env.MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
process.env.MONGODB_DB = "souq_uae_test_growth";
process.env.NEXT_PUBLIC_SITE_URL = "https://shop.example";
(process.env as Record<string, string>).NODE_ENV = "test";
delete process.env.PAYMENT_PROVIDER;

const up = await mongoose.connect(process.env.MONGODB_URI, { dbName: "souq_uae_test_growth", serverSelectionTimeoutMS: 1500 }).then(() => true, () => false);

const { sendAbandonedCartReminders } = await import("@/features/growth/abandoned-cart");
const { subscribeStockAlert, sendBackInStockAlerts } = await import("@/features/growth/stock-alerts");
const { sendReviewRequests, rewardApprovedReview, REVIEW_REWARD } = await import("@/features/growth/reviews");
const { getReferralCode, resolveReferrer, payReferralRewards, referralStats, REFERRAL_REWARD } = await import("@/features/growth/referrals");
const { GET: restoreCart } = await import("@/app/[lang]/cart/restore/route");
const { placeOrder } = await import("@/features/orders/place");
const { updateOrderStatus } = await import("@/features/orders/lifecycle");
const { creditSummary } = await import("@/features/credit/service");
const { Cart } = await import("@/models/cart");
const { Category } = await import("@/models/category");
const { Coupon } = await import("@/models/coupon");
const { CreditLot } = await import("@/models/credit-lot");
const { DeliveryZone } = await import("@/models/delivery-zone");
const { Order } = await import("@/models/order");
const { Product } = await import("@/models/product");
const { Review } = await import("@/models/review");
const { ReviewReward } = await import("@/models/review-reward");
const { Settings } = await import("@/models/settings");
const { StockAlert } = await import("@/models/stock-alert");
const { User } = await import("@/models/user");
const { NextRequest } = await import("next/server");

const HOUR = 3_600_000, DAY = 86_400_000;
const ADDR = { recipientName: "Sara Ali", phone: "+971501234567", emirate: "dubai", area: "Marina", building: "B1" };
let n = 0;
const key = () => `key-${++n}-${"x".repeat(16)}`;
const mkProduct = (sku: string, stock = 20, price = 100, extra: Record<string, unknown> = {}) =>
  Product.create({ slug: sku.toLowerCase(), sku, name: sku, category: "c", priceFrom: price, priceTo: price, stock, status: "active", ...extra });
const mkUser = (email: string, verified = true, extra: Record<string, unknown> = {}) =>
  User.create({ email, name: "Sara Ali", passwordHash: "x", locale: "en", ...(verified ? { emailVerifiedAt: new Date() } : {}), ...extra });
const order = (o: Record<string, unknown> = {}) =>
  placeOrder({ locale: "en", address: ADDR, method: "cod", idempotencyKey: key(), returnBase: "http://localhost:3000", buy: { sku: "P1", qty: 1 }, ...o } as Parameters<typeof placeOrder>[0]);
/** Backdate a cart (timestamps are managed by Mongoose, so write the raw collection). */
const age = (id: unknown, hours: number, extra: Record<string, unknown> = {}) => Cart.collection.updateOne({ _id: id as never }, { $set: { updatedAt: new Date(Date.now() - hours * HOUR), ...extra } });
const deliver = async (orderNumber: string, daysAgo: number) => {
  for (const to of ["processing", "packed", "out_for_delivery", "delivered"] as const) expect((await updateOrderStatus({ orderNumber, to, actor: "staff", notify: false })).ok).toBe(true);
  await Order.updateOne({ orderNumber }, { $set: { "timeline.$[e].at": new Date(Date.now() - daysAgo * DAY) } }, { arrayFilters: [{ "e.status": "delivered" }] });
};

describe.skipIf(!up)("growth features (real MongoDB)", () => {
  const models = [Order, Product, Cart, User, Review, ReviewReward, Coupon, CreditLot, StockAlert, DeliveryZone, Settings, Category];
  beforeAll(async () => { await mongoose.connection.dropDatabase(); await Promise.all(models.map((m) => m.createIndexes())); }, 60_000);
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  beforeEach(async () => {
    for (const c of await mongoose.connection.db!.collections()) await c.deleteMany({});
    sent.length = 0; jar.clear(); mailWorks = true;
    await Category.create({ slug: "c", name: "C", type: "category" });
    await Settings.create({ key: "store", minOrder: 0, freeDeliveryThreshold: 0, codFee: 0, codMaxOrder: 0, offers: { tier: { enabled: false }, firstOrder: { enabled: false } } });
    await DeliveryZone.create({ key: "metro", name: { en: "Metro", ar: "Metro" }, emirates: ["dubai"], fee: 15, estimate: { en: "1-2 days", ar: "1-2 days" } });
    await mkProduct("P1");
  });

  describe("abandoned cart reminders", () => {
    const cartOf = async (o: Record<string, unknown>) => (await Cart.create({ items: [{ sku: "P1", qty: 2, priceAtAdd: 100 }], ...o }))._id;

    it("emails a verified customer's bag once it has sat for an hour, with a link back — and only once per change", async () => {
      const u = await mkUser("a@x.com"); const id = await cartOf({ user: u._id });
      await age(id, 0.5);
      expect(await sendAbandonedCartReminders()).toEqual({ sent: 0 }); // too fresh
      await age(id, 2);
      expect(await sendAbandonedCartReminders()).toEqual({ sent: 1 });
      expect(sent[0].to).toBe("a@x.com");
      expect(sent[0].html).toMatch(/https:\/\/shop\.example\/en\/cart\/restore\?t=[A-Za-z0-9_-]{20,}/);
      expect(sent[0].html).toContain("P1");
      expect(await sendAbandonedCartReminders()).toEqual({ sent: 0 }); // already reminded
      await age(id, 1.5, { remindedAt: new Date(Date.now() - 3 * HOUR) }); // the bag changed after the reminder
      expect(await sendAbandonedCartReminders()).toEqual({ sent: 1 });
    });

    it("guest bags need the email typed at checkout; unverified accounts, old bags and empty bags are skipped", async () => {
      const g1 = await cartOf({ guestId: "g".repeat(24), email: "guest@x.com", locale: "ar" });
      const g2 = await cartOf({ guestId: "h".repeat(24) }); // no email
      const un = await mkUser("un@x.com", false); const c3 = await cartOf({ user: un._id });
      const c4 = await cartOf({ guestId: "i".repeat(24), email: "old@x.com" });
      for (const id of [g1, g2, c3]) await age(id, 3);
      await age(c4, 100); // past the 72 h window
      expect(await sendAbandonedCartReminders()).toEqual({ sent: 1 });
      expect(sent[0].to).toBe("guest@x.com");
      expect(sent[0].subject).toContain("تركت"); // Arabic copy for an Arabic shopper
    });

    it("a bag that already became an order is not chased", async () => {
      const u = await mkUser("b@x.com"); const id = await cartOf({ user: u._id });
      await age(id, 5);
      const placed = await order({ userId: String(u._id), email: u.email });
      expect(placed.ok).toBe(true);
      await age(id, 4); // the order is newer than the last bag change
      expect(await sendAbandonedCartReminders()).toEqual({ sent: 0 });
    });

    it("a failed send is retried on the next run instead of being marked done", async () => {
      const u = await mkUser("c@x.com"); const id = await cartOf({ user: u._id });
      await age(id, 3);
      process.env.NODE_ENV = "production"; mailWorks = false;
      expect(await sendAbandonedCartReminders()).toEqual({ sent: 0 });
      mailWorks = true;
      expect(await sendAbandonedCartReminders()).toEqual({ sent: 1 });
      process.env.NODE_ENV = "test";
    });

    it("the email link reopens a guest bag on another device (cookie handed over) and sends bad tokens to the cart", async () => {
      const id = await cartOf({ guestId: "g".repeat(24), email: "guest@x.com", restoreToken: "t".repeat(24) });
      void id;
      const ok = await restoreCart(new NextRequest("https://shop.example/en/cart/restore?t=" + "t".repeat(24)), { params: Promise.resolve({ lang: "en" }) });
      expect(ok.headers.get("location")).toBe("https://shop.example/en/cart");
      expect([...jar.values()]).toContain("g".repeat(24));
      jar.clear();
      const bad = await restoreCart(new NextRequest("https://shop.example/en/cart/restore?t=nope"), { params: Promise.resolve({ lang: "en" }) });
      expect(bad.headers.get("location")).toBe("https://shop.example/en/cart");
      expect(jar.size).toBe(0);
      const u = await mkUser("d@x.com"); await cartOf({ user: u._id, restoreToken: "u".repeat(24) });
      const acct = await restoreCart(new NextRequest("https://shop.example/en/cart/restore?t=" + "u".repeat(24)), { params: Promise.resolve({ lang: "en" }) });
      expect(acct.headers.get("location")).toContain("/en/login?next=");
    });
  });

  describe("back-in-stock alerts", () => {
    it("only for something actually sold out; one email per person when it returns; asking again re-arms", async () => {
      await mkProduct("SOLD", 0, 50);
      expect(await subscribeStockAlert({ sku: "P1", email: "a@x.com", locale: "en" })).toEqual({ ok: false, error: "in_stock" });
      expect(await subscribeStockAlert({ sku: "NOPE", email: "a@x.com", locale: "en" })).toEqual({ ok: false, error: "not_found" });
      expect(await subscribeStockAlert({ sku: "SOLD", email: "A@x.com", locale: "en" })).toEqual({ ok: true });
      expect(await subscribeStockAlert({ sku: "SOLD", email: "a@x.com", locale: "en" })).toEqual({ ok: true }); // duplicate collapses
      await subscribeStockAlert({ sku: "SOLD", email: "b@x.com", locale: "ar" });
      expect(await StockAlert.countDocuments()).toBe(2);
      expect(await sendBackInStockAlerts()).toEqual({ sent: 0 }); // still sold out
      await Product.updateOne({ sku: "SOLD" }, { stock: 3 });
      expect(await sendBackInStockAlerts()).toEqual({ sent: 2 });
      expect(sent.map((m) => m.to).sort()).toEqual(["a@x.com", "b@x.com"]);
      expect(sent.find((m) => m.to === "b@x.com")!.subject).toContain("عاد");
      expect(sent[0].html).toContain("https://shop.example/");
      expect(await sendBackInStockAlerts()).toEqual({ sent: 0 }); // once each
      await Product.updateOne({ sku: "SOLD" }, { stock: 0 });
      await subscribeStockAlert({ sku: "SOLD", email: "a@x.com", locale: "en" }); // sold out again → re-armed
      await Product.updateOne({ sku: "SOLD" }, { stock: 2 });
      expect(await sendBackInStockAlerts()).toEqual({ sent: 1 });
    });

    it("works per size / colour (variant SKU)", async () => {
      await mkProduct("TEE", 5, 80, { variants: [{ sku: "TEE-M", size: "M", price: 80, stock: 0 }, { sku: "TEE-L", size: "L", price: 80, stock: 5 }] });
      expect((await subscribeStockAlert({ sku: "TEE-L", email: "a@x.com", locale: "en" }))).toEqual({ ok: false, error: "in_stock" });
      expect((await subscribeStockAlert({ sku: "TEE-M", email: "a@x.com", locale: "en" }))).toEqual({ ok: true });
      await Product.updateOne({ sku: "TEE", "variants.sku": "TEE-M" }, { $set: { "variants.$.stock": 4 } });
      expect(await sendBackInStockAlerts()).toEqual({ sent: 1 });
      expect(sent[0].subject).toContain("TEE — M");
    });
  });

  describe("review requests and the thank-you coupon", () => {
    const delivered = async (u: { _id: unknown; email: string }, days: number) => {
      const r = await order({ userId: String(u._id), email: u.email }) as { orderNumber: string };
      await deliver(r.orderNumber, days);
      return (await Order.findOne({ orderNumber: r.orderNumber }).lean())!;
    };

    it("asks 5–30 days after delivery, once, only for products not yet reviewed, only verified customers", async () => {
      const u = await mkUser("r@x.com"); const un = await mkUser("un@x.com", false);
      const fresh = await delivered(u, 2); // too soon
      expect(await sendReviewRequests()).toEqual({ sent: 0 });
      await Order.updateOne({ _id: fresh._id }, { $set: { "timeline.$[e].at": new Date(Date.now() - 6 * DAY) } }, { arrayFilters: [{ "e.status": "delivered" }] });
      await delivered(un, 8); // unverified: skipped
      sent.length = 0; // (placing the orders above sent confirmation mails)
      expect(await sendReviewRequests()).toEqual({ sent: 1 });
      expect(sent[0].to).toBe("r@x.com");
      expect(sent[0].html).toContain("/en/p/p1#reviews");
      expect(await sendReviewRequests()).toEqual({ sent: 0 });
    });

    it("does not nag about a product the customer already reviewed", async () => {
      const u = await mkUser("rv@x.com"); const o = await delivered(u, 7);
      const prod = (await Product.findOne({ sku: "P1" }).lean())!;
      await Review.create({ product: prod._id, user: u._id, order: o._id, rating: 5, body: "Great product, loved it", authorName: "Sara A.", verified: true, status: "pending" });
      expect(await sendReviewRequests()).toEqual({ sent: 0 });
      expect((await Order.findById(o._id).lean())!.reviewRequestedAt).toBeInstanceOf(Date); // marked so it isn't re-checked forever
    });

    it("an approved VERIFIED review earns one single-use 10% coupon per order, and the customer is emailed the code", async () => {
      const u = await mkUser("w@x.com"); const o = await delivered(u, 7);
      const prod = (await Product.findOne({ sku: "P1" }).lean())!;
      const rv = await Review.create({ product: prod._id, user: u._id, order: o._id, rating: 5, body: "Great product, loved it", authorName: "Sara A.", verified: true, status: "pending" });
      expect(await rewardApprovedReview(rv._id)).toBeNull(); // not approved yet
      await Review.updateOne({ _id: rv._id }, { status: "approved" });
      const code = await rewardApprovedReview(rv._id);
      expect(code).toMatch(/^THANKS-[A-Z0-9]{6}$/);
      const c = (await Coupon.findOne({ code }).lean())!;
      expect(c).toMatchObject({ type: "percent", value: REVIEW_REWARD.percent, usageLimit: 1, perCustomerLimit: 1, active: true, public: false });
      expect(c.endsAt!.getTime()).toBeGreaterThan(Date.now() + 50 * DAY);
      expect(sent.some((m) => m.to === "w@x.com" && m.html!.includes(code!))).toBe(true);
      expect(await rewardApprovedReview(rv._id)).toBeNull(); // approving again pays nothing more
      const rv2 = await Review.create({ product: new Types.ObjectId(), user: u._id, order: o._id, rating: 4, body: "Another review on the same order", authorName: "Sara A.", verified: true, status: "approved" });
      expect(await rewardApprovedReview(rv2._id)).toBeNull(); // one reward per order
      expect(await Coupon.countDocuments({ code: /^THANKS-/ })).toBe(1);
    });

    it("unverified-purchase reviews earn nothing", async () => {
      const u = await mkUser("nv@x.com"); const prod = (await Product.findOne({ sku: "P1" }).lean())!;
      const rv = await Review.create({ product: prod._id, user: u._id, rating: 5, body: "Nice, never bought it though", authorName: "S", verified: false, status: "approved" });
      expect(await rewardApprovedReview(rv._id)).toBeNull();
      expect(await Coupon.countDocuments()).toBe(0);
    });
  });

  describe("referrals", () => {
    it("only verified customers get a code, stable across calls, and it never resolves to the buyer themself", async () => {
      const a = await mkUser("a@x.com"); const un = await mkUser("un@x.com", false);
      expect(await getReferralCode(String(un._id))).toBeNull();
      const code = (await getReferralCode(String(a._id)))!;
      expect(code).toMatch(/^FRIEND-[A-Z0-9]{5}$/);
      expect(await getReferralCode(String(a._id))).toBe(code);
      expect(await resolveReferrer(code, { userId: String(a._id) })).toBeNull();
      expect(await resolveReferrer(code, { email: "A@x.com" })).toBeNull();
      expect(await resolveReferrer(code.toLowerCase(), { email: "b@x.com" })).toBe(String(a._id));
      expect(await resolveReferrer("nope-nope", {})).toBeNull();
      expect(await resolveReferrer("../etc", {})).toBeNull();
    });

    it("a first order through a friend's code is tagged; a repeat order, your own code, or a bad code are simply ignored", async () => {
      const a = await mkUser("a@x.com"); const code = (await getReferralCode(String(a._id)))!;
      const b = await mkUser("b@x.com");
      const first = await order({ userId: String(b._id), email: b.email, referralCode: code }) as { orderNumber: string };
      expect(first.orderNumber).toBeTruthy();
      expect((await Order.findOne({ orderNumber: first.orderNumber }).lean())!.referral).toMatchObject({ code, referrer: a._id });
      const second = await order({ userId: String(b._id), email: b.email, referralCode: code }) as { orderNumber: string };
      expect((await Order.findOne({ orderNumber: second.orderNumber }).lean())!.referral).toBeUndefined(); // not a first order any more
      const own = await order({ userId: String(a._id), email: a.email, referralCode: code }) as { orderNumber: string };
      expect((await Order.findOne({ orderNumber: own.orderNumber }).lean())!.referral).toBeUndefined();
      const c = await mkUser("c@x.com");
      const bad = await order({ userId: String(c._id), email: c.email, referralCode: "FRIEND-ZZZZZ" }) as { orderNumber: string };
      expect((await Order.findOne({ orderNumber: bad.orderNumber }).lean())!.referral).toBeUndefined();
    });

    it("pays both sides only after delivery, exactly once, and a cancelled order pays nothing", async () => {
      const a = await mkUser("a@x.com"); const code = (await getReferralCode(String(a._id)))!;
      const b = await mkUser("b@x.com");
      const o = await order({ userId: String(b._id), email: b.email, referralCode: code }) as { orderNumber: string };
      expect(await payReferralRewards()).toEqual({ paid: 0 }); // not delivered
      await deliver(o.orderNumber, 1);
      expect(await referralStats(String(a._id))).toMatchObject({ paid: 0, pending: 1, earned: 0 });
      expect(await payReferralRewards()).toEqual({ paid: 1 });
      expect((await creditSummary(String(a._id))).balance).toBe(REFERRAL_REWARD);
      expect((await creditSummary(String(b._id))).balance).toBe(REFERRAL_REWARD);
      expect(await payReferralRewards()).toEqual({ paid: 0 });
      expect((await creditSummary(String(a._id))).balance).toBe(REFERRAL_REWARD); // not twice
      expect(await referralStats(String(a._id))).toMatchObject({ paid: 1, pending: 0, earned: REFERRAL_REWARD });
      expect(sent.filter((m) => /web credit/i.test(m.subject)).map((m) => m.to).sort()).toEqual(["a@x.com", "b@x.com"]);

      const d = await mkUser("d@x.com");
      const x = await order({ userId: String(d._id), email: d.email, referralCode: code }) as { orderNumber: string };
      await updateOrderStatus({ orderNumber: x.orderNumber, to: "cancelled", actor: "staff", notify: false });
      expect(await payReferralRewards()).toEqual({ paid: 0 });
    });

    it("a guest friend is rewarded once a verified account with their email exists — until then it waits", async () => {
      const a = await mkUser("a@x.com"); const code = (await getReferralCode(String(a._id)))!;
      const g = await order({ guestId: "g".repeat(24), email: "guest@x.com", referralCode: code }) as { orderNumber: string };
      await deliver(g.orderNumber, 1);
      expect(await payReferralRewards()).toEqual({ paid: 0 });
      expect((await Order.findOne({ orderNumber: g.orderNumber }).lean())!.referral!.rewardedAt).toBeUndefined();
      await mkUser("guest@x.com");
      expect(await payReferralRewards()).toEqual({ paid: 1 });
      expect((await creditSummary(String(a._id))).balance).toBe(REFERRAL_REWARD);
      expect((await User.findOne({ email: "guest@x.com" }).lean()) && (await creditSummary(String((await User.findOne({ email: "guest@x.com" }).lean())!._id))).balance).toBe(REFERRAL_REWARD);
    });
  });
});
