// Integration tests against a REAL local MongoDB (database "souq_uae_test_credit", wiped between tests). Skipped if Mongo is down.
// Covers: email OTP sign-up, linking earlier guest orders, web-credit lots (issue / spend / restore / expiry),
// checkout with "use web credit first" (partial and full), and the return → refund-as-credit → spend loop.
import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const sent: { to: string; subject: string; text: string }[] = [];
vi.mock("@/lib/mailer", () => ({ getMailer: () => ({ send: async (m: { to: string; subject: string; text: string }) => { sent.push(m); return { sent: true }; } }) }));
const sessions: string[] = [];
vi.mock("@/lib/auth/session", () => ({ createSession: async (id: string) => { sessions.push(id); }, getCurrentUser: async () => null, destroySession: async () => {}, destroyAllSessions: async () => {} }));
vi.mock("@/features/cart/service", () => ({ mergeGuestCart: async () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "9.9.9.9" }), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT:${u}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, unstable_cache: (f: unknown) => f }));

process.env.MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
process.env.MONGODB_DB = "souq_uae_test_credit";
delete process.env.PAYMENT_PROVIDER; // COD only

const up = await mongoose.connect(process.env.MONGODB_URI, { dbName: "souq_uae_test_credit", serverSelectionTimeoutMS: 1500 }).then(() => true, () => false);

const { placeOrder } = await import("@/features/orders/place");
const { updateOrderStatus } = await import("@/features/orders/lifecycle");
const { sendOtp, checkOtp, claimGuestOrders, OTP_MAX_ATTEMPTS } = await import("@/features/auth/otp");
const { registerAction, verifyEmailAction, resendOtpAction, loginAction } = await import("@/features/auth/actions");
const { issueCredit, spendCredit, restoreOrderCredit, creditSummary, creditHistory, CREDIT_VALID_DAYS } = await import("@/features/credit/service");
const { createReturn, reviewReturn, receiveReturn, completeReturn } = await import("@/features/returns/service");
const { Category } = await import("@/models/category");
const { CreditLot } = await import("@/models/credit-lot");
const { DeliveryZone } = await import("@/models/delivery-zone");
const { EmailOtp } = await import("@/models/email-otp");
const { Order } = await import("@/models/order");
const { Product } = await import("@/models/product");
const { RateLimit } = await import("@/models/rate-limit");
const { ReturnRequest } = await import("@/models/return-request");
const { Settings } = await import("@/models/settings");
const { User } = await import("@/models/user");
const { InventoryMovement } = await import("@/models/inventory-movement");
const { hashPassword } = await import("@/lib/auth/password");

const ADDR = { recipientName: "Sara Ali", phone: "+971501234567", emirate: "dubai", area: "Marina", building: "B1" };
let n = 0;
const key = () => `key-${++n}-${"x".repeat(16)}`;
const SKU = "TEE-1";
const mkProduct = (sku = SKU, stock = 20, price = 100) =>
  Product.create({ slug: sku.toLowerCase(), sku, name: sku, category: "c", priceFrom: price, priceTo: price, stock, status: "active" });
const mkUser = (email = "sara@example.com", verified = true) =>
  User.create({ email, name: "Sara Ali", passwordHash: "x", ...(verified ? { emailVerifiedAt: new Date() } : {}) });
const order = (o: Record<string, unknown> = {}) =>
  placeOrder({ locale: "en", address: ADDR, method: "cod", idempotencyKey: key(), returnBase: "http://localhost:3000", buy: { sku: SKU, qty: 1 }, ...o } as Parameters<typeof placeOrder>[0]);
const lastCode = () => /\b(\d{6})\b/.exec(sent[sent.length - 1].text)![1];
const redirectOf = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const m = /^REDIRECT:(.*)$/.exec((e as Error).message); if (!m) throw e; return m[1]; } };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe.skipIf(!up)("accounts with email OTP, web credit and refunds (real MongoDB)", () => {
  const models = [Order, Product, CreditLot, DeliveryZone, Settings, Category, EmailOtp, User, ReturnRequest, InventoryMovement];
  beforeAll(async () => { await mongoose.connection.dropDatabase(); await Promise.all(models.map((m) => m.createIndexes())); }, 60_000);
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  beforeEach(async () => {
    for (const c of await mongoose.connection.db!.collections()) await c.deleteMany({});
    sent.length = 0; sessions.length = 0;
    await Category.create({ slug: "c", name: "C" });
    // Automatic offers off so the arithmetic below is plain: 100 + AED 15 delivery = 115 per single-item order.
    await Settings.create({ key: "store", minOrder: 0, freeDeliveryThreshold: 0, codFee: 0, offers: { tier: { enabled: false }, firstOrder: { enabled: false } } });
    await DeliveryZone.create({ key: "metro", name: { en: "Metro", ar: "Metro" }, emirates: ["dubai", "sharjah"], fee: 15, estimate: { en: "1-2 days", ar: "1-2 days" } });
    await mkProduct();
  });

  describe("email OTP", () => {
    it("mails a 6-digit code and accepts it exactly once", async () => {
      await sendOtp("a@x.com", "register", "en", { name: "A", passwordHash: "h", locale: "en", next: "" });
      expect(lastCode()).toMatch(/^\d{6}$/);
      expect(sent[0].to).toBe("a@x.com");
      const code = lastCode();
      const ok = await checkOtp("a@x.com", "register", code);
      expect(ok).toMatchObject({ ok: true, pending: { name: "A" } });
      expect(await checkOtp("a@x.com", "register", code)).toMatchObject({ ok: false, error: "otp_expired" }); // single use
    });

    it("rejects wrong codes and locks after the attempt limit — even for the right code afterwards", async () => {
      await sendOtp("b@x.com", "register", "en", { name: "B", passwordHash: "h", locale: "en", next: "" });
      const good = lastCode(); const bad = good === "000000" ? "111111" : "000000";
      for (let i = 1; i < OTP_MAX_ATTEMPTS; i++) expect(await checkOtp("b@x.com", "register", bad)).toMatchObject({ ok: false, error: "otp_invalid" });
      expect(await checkOtp("b@x.com", "register", bad)).toMatchObject({ ok: false, error: "otp_locked" });
      expect((await checkOtp("b@x.com", "register", good)).ok).toBe(false);
    });

    it("expired codes are refused, and a resend inside the cooldown is not sent", async () => {
      await sendOtp("c@x.com", "register", "en", { name: "C", passwordHash: "h", locale: "en", next: "" });
      const again = await sendOtp("c@x.com", "register", "en");
      expect(again).toMatchObject({ ok: false });
      expect(sent).toHaveLength(1);
      await EmailOtp.updateOne({ email: "c@x.com" }, { expiresAt: new Date(Date.now() - 1000) });
      expect(await checkOtp("c@x.com", "register", lastCode())).toMatchObject({ ok: false, error: "otp_expired" });
    });

    it("a new code replaces the old one", async () => {
      await sendOtp("d@x.com", "register", "en", { name: "D", passwordHash: "h", locale: "en", next: "" });
      const first = lastCode();
      await sendOtp("d@x.com", "register", "en", undefined, { force: true });
      const second = lastCode();
      if (first !== second) expect((await checkOtp("d@x.com", "register", first)).ok).toBe(false);
      expect((await checkOtp("d@x.com", "register", second)).ok).toBe(true);
    });
  });

  describe("register → verify → sign-in", () => {
    const reg = (email = "new@x.com") => registerAction({}, fd({ locale: "en", name: "New Buyer", email, password: "correct-horse-battery", next: "" }));

    it("creates NO account until the code is entered; then creates a verified one and starts a session", async () => {
      expect(await redirectOf(reg())).toBe("/en/verify-email?email=new%40x.com");
      expect(await User.countDocuments()).toBe(0);
      const done = await redirectOf(verifyEmailAction({}, fd({ locale: "en", email: "new@x.com", purpose: "register", code: lastCode() })));
      expect(done).toBe("/en/account");
      const u = await User.findOne({ email: "new@x.com" }).select("+passwordHash").lean();
      expect(u?.emailVerifiedAt).toBeInstanceOf(Date);
      expect(u?.passwordHash).not.toBe("correct-horse-battery"); // hashed
      expect(sessions).toEqual([String(u!._id)]);
      expect(await EmailOtp.countDocuments()).toBe(0);
    });

    it("a wrong code creates nothing and a taken email is refused up-front", async () => {
      await redirectOf(reg("w@x.com"));
      const code = lastCode(); const bad = code === "123456" ? "654321" : "123456";
      expect(await verifyEmailAction({}, fd({ locale: "en", email: "w@x.com", purpose: "register", code: bad }))).toMatchObject({ error: "otp_invalid" });
      expect(await User.countDocuments()).toBe(0);
      await mkUser("taken@x.com");
      expect(await reg("taken@x.com")).toMatchObject({ fieldErrors: { email: "email_taken" } });
    });

    it("links EARLIER guest orders placed with the same email — but only once the email is verified", async () => {
      const g1 = await order({ guestId: "g".repeat(24), email: "old@x.com" });
      const g2 = await order({ guestId: "g".repeat(24), email: "OLD@x.com" });
      const other = await order({ guestId: "h".repeat(24), email: "someone-else@x.com" });
      expect(g1.ok && g2.ok && other.ok).toBe(true);
      expect(await Order.countDocuments({ user: { $exists: true } })).toBe(0);
      await redirectOf(reg("old@x.com"));
      expect(await Order.countDocuments({ user: { $exists: true } })).toBe(0); // not yet: nothing proven
      await redirectOf(verifyEmailAction({}, fd({ locale: "en", email: "old@x.com", purpose: "register", code: lastCode() })));
      const u = (await User.findOne({ email: "old@x.com" }).lean())!;
      const mine = await Order.find({ user: u._id }).lean();
      expect(mine).toHaveLength(2);
      expect(mine.every((o) => o.guest === false)).toBe(true);
      expect(await Order.countDocuments({ email: "someone-else@x.com", user: { $exists: false } })).toBe(1);
    });

    it("an older, unverified customer account must verify at sign-in (and then gets their orders)", async () => {
      await User.create({ email: "legacy@x.com", name: "Legacy", passwordHash: await hashPassword("correct-horse-battery"), locale: "en" });
      await order({ guestId: "g".repeat(24), email: "legacy@x.com" });
      const to = await redirectOf(loginAction({}, fd({ locale: "en", email: "legacy@x.com", password: "correct-horse-battery", next: "" })));
      expect(to).toBe("/en/verify-email?email=legacy%40x.com&purpose=verify");
      expect(sessions).toHaveLength(0); // no session before the code
      const done = await redirectOf(verifyEmailAction({}, fd({ locale: "en", email: "legacy@x.com", purpose: "verify", code: lastCode() })));
      expect(done).toBe("/en/account");
      const u = (await User.findOne({ email: "legacy@x.com" }).lean())!;
      expect(u.emailVerifiedAt).toBeInstanceOf(Date);
      expect(await Order.countDocuments({ user: u._id })).toBe(1);
    });

    it("staff are not forced through the email code (a mail outage can't lock the owner out)", async () => {
      await User.create({ email: "boss@x.com", name: "Boss", passwordHash: await hashPassword("correct-horse-battery"), role: "owner" });
      const to = await redirectOf(loginAction({}, fd({ locale: "en", email: "boss@x.com", password: "correct-horse-battery", next: "" })));
      expect(to).toBe("/en/account");
      expect(sent).toHaveLength(0);
    });

    it("resend works only for something that is actually waiting", async () => {
      expect(await resendOtpAction({}, fd({ locale: "en", email: "nobody@x.com", purpose: "register" }))).toMatchObject({ error: "otp_expired" });
      await redirectOf(reg("r@x.com"));
      await EmailOtp.updateOne({ email: "r@x.com" }, { sentAt: new Date(Date.now() - 60_000) });
      expect(await resendOtpAction({}, fd({ locale: "en", email: "r@x.com", purpose: "register" }))).toMatchObject({ ok: true });
      expect(sent).toHaveLength(2);
      expect(await resendOtpAction({}, fd({ locale: "en", email: "r@x.com", purpose: "register" }))).toMatchObject({ error: "otp_wait" });
    });

    it("OTP guessing is rate-limited per email across fresh codes", async () => {
      await redirectOf(reg("rl@x.com"));
      let last: unknown;
      for (let i = 0; i < 14; i++) last = await verifyEmailAction({}, fd({ locale: "en", email: "rl@x.com", purpose: "register", code: "000000" }));
      expect(last).toMatchObject({ error: "rate_limited" });
      await RateLimit.deleteMany({});
    });
  });

  describe("web credit lots", () => {
    it("issues 90-day lots, sums only unexpired ones, and shows history states", async () => {
      const u = await mkUser();
      const lot = await issueCredit({ userId: u._id, amount: 40.5, source: "return", ref: "RET-1" });
      expect(Math.round((lot.expiresAt.getTime() - Date.now()) / 86_400_000)).toBe(CREDIT_VALID_DAYS);
      await CreditLot.create({ user: u._id, amountFils: 5000, remainingFils: 5000, expiresAt: new Date(Date.now() - 1000), source: "admin" }); // already expired
      const s = await creditSummary(String(u._id));
      expect(s.balance).toBe(40.5);
      const h = await creditHistory(String(u._id));
      expect(h.map((x) => x.state).sort()).toEqual(["active", "expired"]);
    });

    it("a return pays out once: issuing again for the same return returns the same lot", async () => {
      const u = await mkUser();
      const a = await issueCredit({ userId: u._id, amount: 30, source: "return", ref: "RET-9" });
      const b = await issueCredit({ userId: u._id, amount: 30, source: "return", ref: "RET-9" });
      expect(b).toMatchObject({ id: a.id, created: false });
      expect((await creditSummary(String(u._id))).balance).toBe(30);
    });

    it("spends the soonest-expiring lot first and is all-or-nothing", async () => {
      const u = await mkUser();
      const later = await CreditLot.create({ user: u._id, amountFils: 3000, remainingFils: 3000, expiresAt: new Date(Date.now() + 80 * 86_400_000), source: "admin" });
      const sooner = await CreditLot.create({ user: u._id, amountFils: 2000, remainingFils: 2000, expiresAt: new Date(Date.now() + 10 * 86_400_000), source: "admin" });
      const r = await spendCredit(String(u._id), 3500);
      expect(r.ok).toBe(true);
      expect((await CreditLot.findById(sooner._id).lean())!.remainingFils).toBe(0);
      expect((await CreditLot.findById(later._id).lean())!.remainingFils).toBe(1500);
      expect((await spendCredit(String(u._id), 1600)).ok).toBe(false); // only 15.00 left
      expect((await creditSummary(String(u._id))).balanceFils).toBe(1500); // the failed attempt took nothing
    });

    it("two parallel spends of the same balance can't both win", async () => {
      const u = await mkUser();
      await issueCredit({ userId: u._id, amount: 50, source: "admin" });
      const rs = await Promise.all(Array.from({ length: 6 }, () => spendCredit(String(u._id), 5000)));
      expect(rs.filter((r) => r.ok)).toHaveLength(1);
      expect((await creditSummary(String(u._id))).balanceFils).toBe(0);
    });
  });

  describe("checkout with web credit", () => {
    it("partial credit on a COD order: credit is taken first, the rest is cash", async () => {
      const u = await mkUser(); await issueCredit({ userId: u._id, amount: 40, source: "admin" });
      const r = await order({ userId: String(u._id), email: u.email, useCredit: true });
      expect(r.ok).toBe(true);
      const o = (await Order.findOne({ orderNumber: (r as { orderNumber: string }).orderNumber }).lean())!;
      expect(o.totals.credit).toBe(40);
      expect(o.totals.total).toBe(75); // 115 − 40
      expect(o.payment).toMatchObject({ method: "cod", status: "cod_pending", amount: 75 });
      expect(o.credit?.amountFils).toBe(4000);
      expect((await creditSummary(String(u._id))).balanceFils).toBe(0);
    });

    it("credit that covers everything pays the order in full: confirmed, paid, no COD fee, no card needed", async () => {
      await Settings.updateOne({ key: "store" }, { codFee: 10 });
      const u = await mkUser(); await issueCredit({ userId: u._id, amount: 300, source: "admin" });
      const r = await order({ userId: String(u._id), email: u.email, useCredit: true, method: "cod" });
      expect(r.ok).toBe(true);
      const o = (await Order.findOne({ orderNumber: (r as { orderNumber: string }).orderNumber }).lean())!;
      expect(o).toMatchObject({ status: "confirmed", payment: { method: "credit", status: "paid" } });
      expect(o.totals.codFee).toBe(0);
      expect(o.totals.total).toBe(0);
      expect(o.totals.credit).toBe(115);
      expect(o.expiresAt).toBeFalsy();
      expect((await creditSummary(String(u._id))).balance).toBe(185); // 300 − 115
      expect((await Product.findOne({ sku: SKU }).lean())!.stock).toBe(19); // stock was taken
    });

    it("does nothing unless the customer asks for it, and guests can never use credit", async () => {
      const u = await mkUser(); await issueCredit({ userId: u._id, amount: 50, source: "admin" });
      const off = await order({ userId: String(u._id), email: u.email });
      const o1 = (await Order.findOne({ orderNumber: (off as { orderNumber: string }).orderNumber }).lean())!;
      expect(o1.totals.credit ?? 0).toBe(0); expect(o1.totals.total).toBe(115);
      const guest = await order({ guestId: "g".repeat(24), useCredit: true });
      const o2 = (await Order.findOne({ orderNumber: (guest as { orderNumber: string }).orderNumber }).lean())!;
      expect(o2.totals.total).toBe(115);
      expect((await creditSummary(String(u._id))).balance).toBe(50);
    });

    it("expired credit is never spent", async () => {
      const u = await mkUser();
      await CreditLot.create({ user: u._id, amountFils: 9000, remainingFils: 9000, expiresAt: new Date(Date.now() - 1000), source: "admin" });
      const r = await order({ userId: String(u._id), email: u.email, useCredit: true });
      const o = (await Order.findOne({ orderNumber: (r as { orderNumber: string }).orderNumber }).lean())!;
      expect(o.totals.total).toBe(115); expect(o.totals.credit ?? 0).toBe(0);
    });

    it("rejects a stale expected total (credit changed between quote and submit)", async () => {
      const u = await mkUser(); await issueCredit({ userId: u._id, amount: 40, source: "admin" });
      const r = await order({ userId: String(u._id), email: u.email, useCredit: true, expectedTotal: 115 });
      expect(r).toMatchObject({ ok: false, error: "total_changed", total: 75 });
      expect((await creditSummary(String(u._id))).balance).toBe(40);
      expect(await Order.countDocuments()).toBe(0);
    });

    it("two parallel checkouts can't spend the same credit twice", async () => {
      await Settings.updateOne({ key: "store" }, { codMaxOrder: 0 });
      const u = await mkUser(); await issueCredit({ userId: u._id, amount: 115, source: "admin" });
      const rs = await Promise.all([order({ userId: String(u._id), email: u.email, useCredit: true }), order({ userId: String(u._id), email: u.email, useCredit: true })]);
      const ok = rs.filter((r) => r.ok);
      const credited = await Order.find({ "credit.amountFils": { $gt: 0 } }).lean();
      const spent = credited.reduce((a, o) => a + (o.credit?.amountFils ?? 0), 0);
      expect(spent).toBeLessThanOrEqual(11500); // never more than the 115.00 that existed
      expect((await creditSummary(String(u._id))).balanceFils).toBe(11500 - spent);
      expect(ok.length).toBeGreaterThan(0);
    });

    it("cancelling the order gives the credit back exactly once (even if cancelled twice)", async () => {
      const u = await mkUser(); await issueCredit({ userId: u._id, amount: 40, source: "admin" });
      const r = await order({ userId: String(u._id), email: u.email, useCredit: true }) as { orderNumber: string };
      expect((await creditSummary(String(u._id))).balance).toBe(0);
      expect((await updateOrderStatus({ orderNumber: r.orderNumber, to: "cancelled", actor: "staff" })).ok).toBe(true);
      expect((await creditSummary(String(u._id))).balance).toBe(40);
      await updateOrderStatus({ orderNumber: r.orderNumber, to: "cancelled", actor: "staff" });
      const o = (await Order.findOne({ orderNumber: r.orderNumber }).lean())!;
      expect(await restoreOrderCredit(o._id)).toBe(0); // already restored
      expect((await creditSummary(String(u._id))).balance).toBe(40);
    });

    it("a fully credit-paid order that is cancelled refunds straight to the wallet", async () => {
      const u = await mkUser(); await issueCredit({ userId: u._id, amount: 200, source: "admin" });
      const r = await order({ userId: String(u._id), email: u.email, useCredit: true }) as { orderNumber: string };
      expect((await creditSummary(String(u._id))).balance).toBe(85);
      await updateOrderStatus({ orderNumber: r.orderNumber, to: "cancelled", actor: "staff" });
      const o = (await Order.findOne({ orderNumber: r.orderNumber }).lean())!;
      expect(o.payment.status).toBe("refunded");
      expect((await creditSummary(String(u._id))).balance).toBe(200);
    });

    it("credit restored late keeps at least a week of validity", async () => {
      const u = await mkUser();
      const lot = await CreditLot.create({ user: u._id, amountFils: 4000, remainingFils: 4000, expiresAt: new Date(Date.now() + 2 * 86_400_000), source: "admin" });
      const r = await order({ userId: String(u._id), email: u.email, useCredit: true }) as { orderNumber: string };
      await updateOrderStatus({ orderNumber: r.orderNumber, to: "cancelled", actor: "staff" });
      const after = (await CreditLot.findById(lot._id).lean())!;
      expect(after.remainingFils).toBe(4000);
      expect(after.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
    });
  });

  describe("return → refund as web credit → spend it", () => {
    async function deliveredOrder(u: { _id: Types.ObjectId; email: string }, qty = 1) {
      const r = await order({ userId: String(u._id), email: u.email, buy: { sku: SKU, qty } }) as { orderNumber: string };
      for (const to of ["processing", "packed", "out_for_delivery", "delivered"] as const) expect((await updateOrderStatus({ orderNumber: r.orderNumber, to, actor: "staff", notify: false })).ok).toBe(true);
      return (await Order.findOne({ orderNumber: r.orderNumber }).lean())!;
    }

    it("completing a credit return adds the item's value to the account as a 90-day lot (no coupon)", async () => {
      const u = await mkUser();
      const o = await deliveredOrder(u, 2); // 200 + 15 delivery
      const c = await createReturn({ order: o, items: [{ sku: SKU, qty: 1 }], resolution: "credit", reason: "changed_mind" });
      expect(c.ok).toBe(true);
      const ret = (await ReturnRequest.findOne({}).lean())!;
      expect((await reviewReturn(String(ret._id), "approved", "staff")).ok).toBe(true);
      expect((await receiveReturn(String(ret._id), "staff", true)).ok).toBe(true);
      const done = await completeReturn(String(ret._id), "staff");
      expect(done).toMatchObject({ ok: true, creditAmount: 100 });
      expect((done as { creditCode?: string }).creditCode).toBeUndefined();
      const s = await creditSummary(String(u._id));
      expect(s.balance).toBe(100);
      expect(Math.round((s.nextExpiry!.getTime() - Date.now()) / 86_400_000)).toBe(90);
      expect((await ReturnRequest.findOne({}).lean())!).toMatchObject({ status: "completed", creditAmount: 100 });
      expect(sent.some((m) => /web credit/i.test(m.text) && m.to === u.email)).toBe(true);
      // completing twice can't pay twice
      expect((await completeReturn(String(ret._id), "staff")).ok).toBe(false);
      expect((await creditSummary(String(u._id))).balance).toBe(100);
    });

    it("the refund is then spent first on the next order", async () => {
      const u = await mkUser();
      const o = await deliveredOrder(u);
      await createReturn({ order: o, items: [{ sku: SKU, qty: 1 }], resolution: "credit", reason: "defective" });
      const ret = (await ReturnRequest.findOne({}).lean())!;
      await reviewReturn(String(ret._id), "approved", "staff"); await receiveReturn(String(ret._id), "staff", true); await completeReturn(String(ret._id), "staff");
      const next = await order({ userId: String(u._id), email: u.email, useCredit: true }) as { orderNumber: string };
      const o2 = (await Order.findOne({ orderNumber: next.orderNumber }).lean())!;
      // The 100.00 refund covers the item; the AED 15 delivery is left to pay on delivery.
      expect(o2.totals).toMatchObject({ credit: 100, total: 15 });
      expect(o2.payment).toMatchObject({ method: "cod", status: "cod_pending", amount: 15 });
      expect((await creditSummary(String(u._id))).balance).toBe(0);
    });

    it("an old guest-made return is credited to the verified account with the same email", async () => {
      const g = await order({ guestId: "g".repeat(24), email: "guest@x.com" }) as { orderNumber: string };
      for (const to of ["processing", "packed", "out_for_delivery", "delivered"] as const) await updateOrderStatus({ orderNumber: g.orderNumber, to, actor: "staff", notify: false });
      const o = (await Order.findOne({ orderNumber: g.orderNumber }).lean())!;
      await createReturn({ order: o, items: [{ sku: SKU, qty: 1 }], resolution: "credit", reason: "other" });
      const ret = (await ReturnRequest.findOne({}).lean())!;
      await reviewReturn(String(ret._id), "approved", "staff"); await receiveReturn(String(ret._id), "staff", false);
      const u = await mkUser("guest@x.com");
      const done = await completeReturn(String(ret._id), "staff");
      expect(done).toMatchObject({ ok: true, creditAmount: 100 });
      expect((await creditSummary(String(u._id))).balance).toBe(100);
    });

    it("without any account the refund still falls back to a single-use coupon", async () => {
      const g = await order({ guestId: "g".repeat(24), email: "nobody@x.com" }) as { orderNumber: string };
      for (const to of ["processing", "packed", "out_for_delivery", "delivered"] as const) await updateOrderStatus({ orderNumber: g.orderNumber, to, actor: "staff", notify: false });
      const o = (await Order.findOne({ orderNumber: g.orderNumber }).lean())!;
      await createReturn({ order: o, items: [{ sku: SKU, qty: 1 }], resolution: "credit", reason: "other" });
      const ret = (await ReturnRequest.findOne({}).lean())!;
      await reviewReturn(String(ret._id), "approved", "staff"); await receiveReturn(String(ret._id), "staff", false);
      const done = await completeReturn(String(ret._id), "staff");
      expect((done as { creditCode?: string }).creditCode).toMatch(/^CR-/);
    });
  });

  it("claimGuestOrders ignores orders that already belong to someone", async () => {
    const a = await mkUser("a@x.com"); const b = await mkUser("b@x.com");
    await order({ userId: String(a._id), email: "shared@x.com" });
    expect(await claimGuestOrders(String(b._id), "shared@x.com")).toBe(0);
    expect(await Order.countDocuments({ user: a._id })).toBe(1);
  });
});
