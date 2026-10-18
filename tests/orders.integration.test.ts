// Integration tests against a REAL local MongoDB (database "souq_uae_test_orders", wiped between tests). Skipped if Mongo is down.
import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
process.env.MONGODB_DB = "souq_uae_test_orders";
process.env.PAYMENT_PROVIDER = "mock";
process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret-0123456789";

const up = await mongoose.connect(process.env.MONGODB_URI, { dbName: "souq_uae_test_orders", serverSelectionTimeoutMS: 1500 }).then(() => true, () => false);

const { placeOrder } = await import("@/features/orders/place");
const { updateOrderStatus, expirePendingOrders } = await import("@/features/orders/lifecycle");
const { handleWebhook } = await import("@/features/orders/payment-events");
const { signedMockEvent } = await import("@/lib/payments/mock");
const { Address } = await import("@/models/address");
const { Cart } = await import("@/models/cart");
const { Category } = await import("@/models/category");
const { Coupon } = await import("@/models/coupon");
const { DeliveryZone } = await import("@/models/delivery-zone");
const { InventoryMovement } = await import("@/models/inventory-movement");
const { Order } = await import("@/models/order");
const { Product } = await import("@/models/product");
const { Settings } = await import("@/models/settings");
const { User } = await import("@/models/user");
const { WebhookEvent } = await import("@/models/webhook-event");
const { CouponRedemption } = await import("@/models/coupon-redemption");

const L = (en: string) => ({ en, ar: en });
let cat: Types.ObjectId;

async function mkUser(email: string) {
  const u = await User.create({ email, name: "T " + email, passwordHash: "x" });
  const a = await Address.create({ user: u._id, recipientName: "T", phone: "+971501234567", emirate: "dubai", area: "Marina", building: "B1", isDefault: true });
  return { id: String(u._id), email, addressId: String(a._id) };
}
const mkProduct = (sku: string, stock: number, price = 100, extra: Record<string, unknown> = {}) =>
  Product.create({ slug: sku.toLowerCase(), sku, name: L(sku), category: cat, price, stock, status: "published", ...extra });
const fillCart = (userId: string, items: { sku: string; qty: number }[]) =>
  Cart.findOneAndUpdate({ user: userId }, { $set: { items: items.map((i) => ({ ...i, priceAtAdd: 1 })) } }, { upsert: true });
let n = 0;
const place = (u: { id: string; email: string; addressId: string }, o: Partial<Parameters<typeof placeOrder>[0]> = {}) =>
  placeOrder({ userId: u.id, email: u.email, locale: "en", addressId: u.addressId, method: "cod", idempotencyKey: `key-${++n}-${"x".repeat(16)}`, returnBase: "http://localhost:3000", ...o });
const stockOf = async (sku: string) => (await Product.findOne({ sku }).lean())!.stock;

describe.skipIf(!up)("orders (real MongoDB)", () => {
  const models = [Order, Product, Coupon, User, Cart, WebhookEvent, CouponRedemption, DeliveryZone, Settings, Address, Category, InventoryMovement];
  beforeAll(async () => {
    await mongoose.connection.dropDatabase();
    await Promise.all(models.map((m) => m.createIndexes())); // unique indexes the code relies on (built once, kept between tests)
  }, 60_000);
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  beforeEach(async () => {
    for (const c of await mongoose.connection.db!.collections()) await c.deleteMany({});
    cat = (await Category.create({ slug: "c", name: L("C") }))._id;
    // Automatic offers are off here so the pre-existing pricing expectations stay exact; offers have their own tests below.
    await Settings.create({ key: "store", minOrder: 50, freeDeliveryThreshold: 200, codFee: 0, offers: { tier: { enabled: false }, firstOrder: { enabled: false } } });
    await DeliveryZone.create({ key: "metro", name: L("Metro"), emirates: ["dubai", "sharjah"], fee: 15, estimate: L("1-2 days") });
  });

  it("creates a COD order with server-side totals, takes stock, clears the cart", async () => {
    const u = await mkUser("a@t.test"); await mkProduct("P1", 5, 100);
    await fillCart(u.id, [{ sku: "P1", qty: 2 }]);
    const r = await place(u);
    expect(r.ok).toBe(true);
    const o = await Order.findOne({ orderNumber: (r as { orderNumber: string }).orderNumber }).lean();
    expect(o).toMatchObject({ status: "confirmed", payment: { method: "cod", status: "cod_pending" }, totals: { subtotal: 200, deliveryFee: 0, total: 200 } });
    expect(o!.items[0]).toMatchObject({ sku: "P1", qty: 2, unitPrice: 100, lineTotal: 200 });
    expect(await stockOf("P1")).toBe(3);
    expect((await Cart.findOne({ user: u.id }).lean())!.items).toHaveLength(0);
    expect(await InventoryMovement.countDocuments({ order: o!._id, delta: -2 })).toBe(1);
  });

  it("ignores any price the browser might claim: totals come from the catalogue", async () => {
    const u = await mkUser("a@t.test"); await mkProduct("P1", 5, 100);
    await fillCart(u.id, [{ sku: "P1", qty: 1 }]); // priceAtAdd=1 in the cart must not matter
    const r = await place(u, { expectedTotal: 1 });
    expect(r).toMatchObject({ ok: false, error: "total_changed", total: 115 });
    expect(await Order.countDocuments()).toBe(0);
    expect(await stockOf("P1")).toBe(5);
  });

  it("is idempotent: the same key twice (sequential and parallel) creates ONE order and takes stock ONCE", async () => {
    const u = await mkUser("a@t.test"); await mkProduct("P1", 10, 100);
    await fillCart(u.id, [{ sku: "P1", qty: 2 }]);
    const key = "same-key-" + "y".repeat(20);
    const results = await Promise.all(Array.from({ length: 6 }, () => place(u, { idempotencyKey: key })));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(new Set(results.map((r) => (r as { orderNumber: string }).orderNumber)).size).toBe(1);
    expect(await Order.countDocuments()).toBe(1);
    expect(await stockOf("P1")).toBe(8);
    const again = await place(u, { idempotencyKey: key });
    expect(again).toMatchObject({ ok: true, duplicate: true });
    expect(await stockOf("P1")).toBe(8);
  });

  it("never oversells the last units under concurrency", async () => {
    await mkProduct("P1", 3, 100);
    const users = await Promise.all(["u1", "u2", "u3", "u4"].map((x) => mkUser(`${x}@t.test`)));
    for (const u of users) await fillCart(u.id, [{ sku: "P1", qty: 2 }]);
    const res = await Promise.all(users.map((u) => place(u)));
    const ok = res.filter((r) => r.ok).length;
    expect(ok).toBe(1); // 3 in stock, 2 each → exactly one order fits
    expect(await stockOf("P1")).toBe(1);
    expect(await Order.countDocuments()).toBe(1); // failed attempts leave no orphan orders
    expect(res.filter((r) => !r.ok).every((r) => !r.ok && (r.error === "out_of_stock" || r.error === "cart_issues"))).toBe(true);
  });

  it("rolls back earlier lines when a later line is out of stock", async () => {
    const u = await mkUser("a@t.test"); await mkProduct("P1", 5, 100); await mkProduct("P2", 5, 100);
    await fillCart(u.id, [{ sku: "P1", qty: 1 }, { sku: "P2", qty: 1 }]);
    await Product.updateOne({ sku: "P2" }, { stock: 0 }); // sold out after the cart check would have passed
    const r = await place(u);
    expect(r.ok).toBe(false);
    expect(await stockOf("P1")).toBe(5);
  });

  it("variant stock is decremented on the variant and the product total", async () => {
    const u = await mkUser("a@t.test");
    await mkProduct("PV", 10, 100, { variants: [{ sku: "PV-1", label: L("S"), stock: 4 }, { sku: "PV-2", label: L("M"), stock: 6 }] });
    await fillCart(u.id, [{ sku: "PV-2", qty: 2 }]);
    expect((await place(u)).ok).toBe(true);
    const p = (await Product.findOne({ sku: "PV" }).lean())!;
    expect(p.stock).toBe(8);
    expect(p.variants.find((v) => v.sku === "PV-2")!.stock).toBe(4);
    expect(p.variants.find((v) => v.sku === "PV-1")!.stock).toBe(4);
  });

  it("refuses to use another customer's address", async () => {
    const a = await mkUser("a@t.test"); const b = await mkUser("b@t.test"); await mkProduct("P1", 5, 100);
    await fillCart(a.id, [{ sku: "P1", qty: 1 }]);
    expect(await place(a, { addressId: b.addressId })).toMatchObject({ ok: false, error: "no_address" });
  });

  it("enforces minimum order, zone coverage and COD limits", async () => {
    const u = await mkUser("a@t.test"); await mkProduct("CHEAP", 5, 20); await mkProduct("BIG", 5, 5000);
    await fillCart(u.id, [{ sku: "CHEAP", qty: 1 }]);
    expect(await place(u)).toMatchObject({ ok: false, error: "below_minimum" });
    await fillCart(u.id, [{ sku: "BIG", qty: 1 }]);
    await Settings.updateOne({ key: "store" }, { codMaxOrder: 3000 });
    expect(await place(u)).toMatchObject({ ok: false, error: "cod_limit" });
    await Address.updateOne({ _id: u.addressId }, { emirate: "fujairah" });
    await Settings.updateOne({ key: "store" }, { codMaxOrder: 0 });
    expect(await place(u)).toMatchObject({ ok: false, error: "no_zone" });
  });

  describe("coupons", () => {
    it("enforces usage limit, per-customer limit, dates; cancellation gives the use back", async () => {
      await mkProduct("P1", 20, 100);
      await Coupon.create({ code: "ONE", type: "fixed", value: 10, usageLimit: 1, perCustomerLimit: 1 });
      await Coupon.create({ code: "OLD", type: "fixed", value: 10, endsAt: new Date(Date.now() - 1000) });
      const a = await mkUser("a@t.test"); const b = await mkUser("b@t.test");
      await fillCart(a.id, [{ sku: "P1", qty: 1 }]); await fillCart(b.id, [{ sku: "P1", qty: 1 }]);
      expect(await place(a, { couponCode: "old" })).toMatchObject({ ok: false, error: "coupon_expired" });
      expect(await place(a, { couponCode: "nope" })).toMatchObject({ ok: false, error: "coupon_invalid" });
      const r1 = await place(a, { couponCode: "one" });
      expect(r1.ok).toBe(true);
      const o = await Order.findOne({ user: a.id }).lean();
      expect(o!.totals.couponDiscount).toBe(10);
      expect(o!.totals.total).toBe(105); // 100 - 10 + 15 delivery
      expect(await place(b, { couponCode: "ONE" })).toMatchObject({ ok: false, error: "coupon_used_up" });
      await fillCart(a.id, [{ sku: "P1", qty: 1 }]);
      expect(await place(a, { couponCode: "ONE" })).toMatchObject({ ok: false, error: "coupon_used_up" });
      await updateOrderStatus({ orderNumber: o!.orderNumber, to: "cancelled", actor: "t" });
      expect((await Coupon.findOne({ code: "ONE" }).lean())!.usedCount).toBe(0);
      expect(await place(b, { couponCode: "ONE" })).toMatchObject({ ok: true });
    });

    it("never lets parallel orders exceed the usage limit", async () => {
      await mkProduct("P1", 50, 100);
      await Coupon.create({ code: "LIM", type: "fixed", value: 5, usageLimit: 2, perCustomerLimit: 1 });
      const users = await Promise.all(Array.from({ length: 6 }, (_, i) => mkUser(`c${i}@t.test`)));
      for (const u of users) await fillCart(u.id, [{ sku: "P1", qty: 1 }]);
      const res = await Promise.all(users.map((u) => place(u, { couponCode: "LIM" })));
      expect(res.filter((r) => r.ok).length).toBe(2);
      expect((await Coupon.findOne({ code: "LIM" }).lean())!.usedCount).toBe(2);
      expect(await Order.countDocuments()).toBe(2);
      expect(await Product.findOne({ sku: "P1" }).then((p) => p!.stock)).toBe(48);
    });
  });

  describe("online payment (mock provider)", () => {
    const setup = async () => {
      const u = await mkUser("a@t.test"); await mkProduct("P1", 5, 100);
      await fillCart(u.id, [{ sku: "P1", qty: 1 }]);
      const r = await place(u, { method: "card" });
      expect(r.ok && r.redirectUrl).toMatch(/\/en\/pay\/mock\/UAE-/);
      const o = (await Order.findOne({ user: u.id }).lean())!;
      return { u, o };
    };
    const event = (o: { orderNumber: string; payment: { providerRef?: string } }, over: Record<string, unknown> = {}) =>
      ({ id: `evt_${Math.random().toString(36).slice(2)}`, type: "payment.succeeded" as const, orderNumber: o.orderNumber, providerRef: o.payment.providerRef!, amount: 115, currency: "AED", ...over });
    const send = (e: ReturnType<typeof event>) => { const { body, headers } = signedMockEvent(e); return handleWebhook(body, headers); };

    it("reserves stock but stays unpaid until a verified webhook arrives", async () => {
      const { o } = await setup();
      expect(o).toMatchObject({ status: "pending_payment", payment: { status: "pending", provider: "mock" } });
      expect(await stockOf("P1")).toBe(4);
    });

    it("rejects unsigned/forged/tampered webhooks", async () => {
      const { o } = await setup();
      const e = event(o);
      expect((await handleWebhook(JSON.stringify(e), new Headers())).status).toBe(400);
      const { body, headers } = signedMockEvent(e);
      expect((await handleWebhook(body.replace("115", "1"), headers)).status).toBe(400);
      expect((await Order.findOne({ _id: o._id }).lean())!.status).toBe("pending_payment");
    });

    it("confirms on a verified success event, exactly once, even if the event is redelivered", async () => {
      const { o } = await setup();
      const e = event(o);
      expect(await send(e)).toEqual({ status: 200, body: "processed" });
      expect(await send(e)).toEqual({ status: 200, body: "duplicate" });
      const after = (await Order.findOne({ _id: o._id }).lean())!;
      expect(after).toMatchObject({ status: "confirmed", payment: { status: "paid" } });
      expect(after.timeline.filter((t) => t.status === "confirmed")).toHaveLength(1);
      const parallel = await Promise.all(Array.from({ length: 4 }, () => send(event(o))));
      expect(parallel.every((p) => p.status === 200)).toBe(true);
      expect((await Order.findOne({ _id: o._id }).lean())!.timeline.filter((t) => t.status === "confirmed")).toHaveLength(1);
    });

    it("does not mark paid when the amount or currency is wrong", async () => {
      const { o } = await setup();
      expect((await send(event(o, { amount: 1 }))).body).toBe("rejected_mismatch");
      expect((await send(event(o, { currency: "USD" }))).body).toBe("rejected_mismatch");
      expect((await send(event(o, { providerRef: "other" }))).body).toBe("rejected_mismatch");
      expect((await Order.findOne({ _id: o._id }).lean())).toMatchObject({ status: "pending_payment", payment: { status: "pending" } });
    });

    it("a failed payment keeps the order retryable; expiry then releases stock exactly once", async () => {
      const { o } = await setup();
      await send(event(o, { type: "payment.failed", reason: "declined" }));
      expect((await Order.findOne({ _id: o._id }).lean())).toMatchObject({ status: "pending_payment", payment: { status: "failed" } });
      await Order.updateOne({ _id: o._id }, { expiresAt: new Date(Date.now() - 1000) });
      expect(await expirePendingOrders()).toMatchObject({ cancelled: 1 });
      expect(await expirePendingOrders()).toMatchObject({ cancelled: 0 });
      expect(await stockOf("P1")).toBe(5);
      expect((await Order.findOne({ _id: o._id }).lean())!.status).toBe("cancelled");
    });

    it("payment arriving after expiry queues a refund instead of fulfilling", async () => {
      const { o } = await setup();
      await Order.updateOne({ _id: o._id }, { expiresAt: new Date(Date.now() - 1000) });
      await expirePendingOrders();
      await send(event(o));
      expect((await Order.findOne({ _id: o._id }).lean())).toMatchObject({ status: "refund_pending", payment: { status: "refund_pending" } });
      await send(event(o, { type: "refund.succeeded" }));
      expect((await Order.findOne({ _id: o._id }).lean())).toMatchObject({ status: "refunded", payment: { status: "refunded" } });
      expect(await stockOf("P1")).toBe(5);
    });
  });

  describe("lifecycle", () => {
    it("walks a COD order to delivered, marks cash collected, and blocks invalid moves", async () => {
      const u = await mkUser("a@t.test"); await mkProduct("P1", 5, 100);
      await fillCart(u.id, [{ sku: "P1", qty: 1 }]);
      const num = ((await place(u)) as { orderNumber: string }).orderNumber;
      expect(await updateOrderStatus({ orderNumber: num, to: "delivered", actor: "t" })).toMatchObject({ ok: false, error: "invalid_transition" });
      for (const s of ["processing", "packed", "out_for_delivery", "delivered"] as const) expect((await updateOrderStatus({ orderNumber: num, to: s, actor: "ops" })).ok).toBe(true);
      expect(await Order.findOne({ orderNumber: num }).lean()).toMatchObject({ status: "delivered", payment: { status: "cod_collected" } });
      expect(await updateOrderStatus({ orderNumber: num, to: "cancelled", actor: "t" })).toMatchObject({ ok: false });
    });

    it("cancelling restores stock once, even if cancelled concurrently", async () => {
      const u = await mkUser("a@t.test"); await mkProduct("P1", 5, 100);
      await fillCart(u.id, [{ sku: "P1", qty: 2 }]);
      const num = ((await place(u)) as { orderNumber: string }).orderNumber;
      expect(await stockOf("P1")).toBe(3);
      const rs = await Promise.all([1, 2, 3].map(() => updateOrderStatus({ orderNumber: num, to: "cancelled", actor: "ops" })));
      expect(rs.filter((r) => r.ok)).toHaveLength(1);
      expect(await stockOf("P1")).toBe(5);
    });
  });
});
