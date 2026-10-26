// Integration tests against a REAL local MongoDB (database "souq_uae_test_guest", wiped between tests). Skipped if Mongo is down.
import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
process.env.MONGODB_DB = "souq_uae_test_guest";
delete process.env.PAYMENT_PROVIDER; // COD only

const up = await mongoose.connect(process.env.MONGODB_URI, { dbName: "souq_uae_test_guest", serverSelectionTimeoutMS: 1500 }).then(() => true, () => false);

const { placeOrder } = await import("@/features/orders/place");
const { updateOrderStatus } = await import("@/features/orders/lifecycle");
const { getOrderByToken } = await import("@/features/orders/queries");
const { createReturn, reviewReturn, receiveReturn, completeReturn, returnWindow } = await import("@/features/returns/service");
const { captureLead } = await import("@/features/offers/leads");
const { Category } = await import("@/models/category");
const { Coupon } = await import("@/models/coupon");
const { CouponRedemption } = await import("@/models/coupon-redemption");
const { DeliveryZone } = await import("@/models/delivery-zone");
const { Lead } = await import("@/models/lead");
const { Order } = await import("@/models/order");
const { Product } = await import("@/models/product");
const { ReturnRequest } = await import("@/models/return-request");
const { Settings } = await import("@/models/settings");
const { Cart } = await import("@/models/cart");
const { InventoryMovement } = await import("@/models/inventory-movement");

const L = (en: string) => ({ en, ar: en });
const ADDR = { recipientName: "Guest Buyer", phone: "+971501234567", emirate: "dubai", area: "Marina", building: "B1" };
let cat: Types.ObjectId; let n = 0;
const key = () => `key-${++n}-${"x".repeat(16)}`;
const mkProduct = (sku: string, stock: number, price = 100, extra: Record<string, unknown> = {}) =>
  Product.create({ slug: sku.toLowerCase(), sku, name: L(sku), category: cat, price, stock, status: "published", ...extra });
const guestCart = (guestId: string, items: { sku: string; qty: number }[]) =>
  Cart.create({ guestId, items: items.map((i) => ({ ...i, priceAtAdd: 1 })), expiresAt: new Date(Date.now() + 86_400_000) });
const guestOrder = (o: Record<string, unknown> = {}) =>
  placeOrder({ guestId: "g".repeat(24), locale: "en", address: ADDR, method: "cod", idempotencyKey: key(), returnBase: "http://localhost:3000", ...o } as Parameters<typeof placeOrder>[0]);

describe.skipIf(!up)("guest checkout, offers, tracking and returns (real MongoDB)", () => {
  const models = [Order, Product, Coupon, Cart, CouponRedemption, DeliveryZone, Settings, Category, Lead, ReturnRequest, InventoryMovement];
  beforeAll(async () => { await mongoose.connection.dropDatabase(); await Promise.all(models.map((m) => m.createIndexes())); }, 60_000);
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  beforeEach(async () => {
    for (const c of await mongoose.connection.db!.collections()) await c.deleteMany({});
    cat = (await Category.create({ slug: "c", name: L("C") }))._id;
    await Settings.create({ key: "store", minOrder: 50, freeDeliveryThreshold: 200, codFee: 0 }); // offers use their defaults: tier 500/10%, first order 10%
    await DeliveryZone.create({ key: "metro", name: L("Metro"), emirates: ["dubai", "sharjah"], fee: 15, estimate: L("1-2 days") });
  });

  describe("guest checkout", () => {
    it("books an order from the guest cart without an account, with a tracking token", async () => {
      await mkProduct("P1", 5, 100); await guestCart("g".repeat(24), [{ sku: "P1", qty: 2 }]);
      const r = await guestOrder({ email: "Guest@Example.com" });
      expect(r).toMatchObject({ ok: true, guest: true });
      const o = await Order.findOne({ orderNumber: (r as { orderNumber: string }).orderNumber }).lean();
      expect(o).toMatchObject({ guest: true, status: "confirmed", email: "guest@example.com", payment: { method: "cod", status: "cod_pending" } });
      expect(o!.user).toBeUndefined();
      expect(o!.trackToken).toMatch(/^[A-Za-z0-9_-]{20,}$/);
      expect((await Product.findOne({ sku: "P1" }).lean())!.stock).toBe(3);
      expect((await Cart.findOne({ guestId: "g".repeat(24) }).lean())!.items).toHaveLength(0);
    });
    it("a double submit with the same key creates one order", async () => {
      await mkProduct("P1", 5, 100); await guestCart("g".repeat(24), [{ sku: "P1", qty: 1 }]);
      const k = key();
      const [a, b] = await Promise.all([guestOrder({ idempotencyKey: k }), guestOrder({ idempotencyKey: k })]);
      expect(a.ok && b.ok && (a as { orderNumber: string }).orderNumber === (b as { orderNumber: string }).orderNumber).toBe(true);
      expect(await Order.countDocuments()).toBe(1);
      expect((await Product.findOne({ sku: "P1" }).lean())!.stock).toBe(4);
    });
    it("refuses to order with no cart and no buy-now item, or without a delivery address", async () => {
      await mkProduct("P1", 5, 100);
      expect(await guestOrder()).toMatchObject({ ok: false, error: "empty_cart" });
      await guestCart("g".repeat(24), [{ sku: "P1", qty: 1 }]);
      expect(await guestOrder({ address: undefined })).toMatchObject({ ok: false, error: "no_address" });
      expect(await Order.countDocuments()).toBe(0);
    });
    it("Buy now orders just that item and leaves the cart alone", async () => {
      await mkProduct("P1", 5, 100); await mkProduct("P2", 5, 80);
      await guestCart("g".repeat(24), [{ sku: "P2", qty: 1 }]);
      const r = await guestOrder({ buy: { sku: "P1", qty: 2 } });
      expect(r.ok).toBe(true);
      const o = await Order.findOne({ orderNumber: (r as { orderNumber: string }).orderNumber }).lean();
      expect(o).toMatchObject({ source: "buy_now" });
      expect(o!.items.map((i) => [i.sku, i.qty])).toEqual([["P1", 2]]);
      expect((await Cart.findOne({ guestId: "g".repeat(24) }).lean())!.items).toHaveLength(1); // untouched
      expect((await Product.findOne({ sku: "P2" }).lean())!.stock).toBe(5);
    });
    it("Buy now works with no cart at all and re-checks stock on the server", async () => {
      await mkProduct("P1", 1, 100);
      expect(await guestOrder({ guestId: "buy-xyz", buy: { sku: "P1", qty: 3 } })).toMatchObject({ ok: false, error: "cart_issues" });
      expect(await guestOrder({ guestId: "buy-xyz", buy: { sku: "P1", qty: 1 } })).toMatchObject({ ok: true });
      expect(await guestOrder({ guestId: "buy-abc", buy: { sku: "P1", qty: 1 } })).toMatchObject({ ok: false });
    });
  });

  describe("automatic offers at order time", () => {
    it("first order gets 10% off, and the second order from the same phone does not", async () => {
      await mkProduct("P1", 10, 100);
      const a = await guestOrder({ buy: { sku: "P1", qty: 1 } });
      expect((await Order.findOne({ orderNumber: (a as { orderNumber: string }).orderNumber }).lean())).toMatchObject({ offer: { kind: "first_order", percent: 10, discount: 10 }, totals: { offerDiscount: 10, subtotal: 100, total: 105 } });
      // Same phone, different name/guest id: still not a first order.
      const b = await guestOrder({ guestId: "buy-second", address: { ...ADDR, recipientName: "Someone Else" }, buy: { sku: "P1", qty: 1 } });
      expect((await Order.findOne({ orderNumber: (b as { orderNumber: string }).orderNumber }).lean())).toMatchObject({ totals: { offerDiscount: 0, total: 115 } });
    });
    it("a cancelled first order doesn't use up the first-order offer", async () => {
      await mkProduct("P1", 10, 100);
      const a = await guestOrder({ buy: { sku: "P1", qty: 1 } }) as { orderNumber: string };
      await updateOrderStatus({ orderNumber: a.orderNumber, to: "cancelled", actor: "system", note: "test", notify: false });
      const b = await guestOrder({ guestId: "buy-again", buy: { sku: "P1", qty: 1 } }) as { orderNumber: string };
      expect((await Order.findOne({ orderNumber: b.orderNumber }).lean())).toMatchObject({ offer: { kind: "first_order" } });
    });
    it("spend AED 500+ gives 10% and free delivery (repeat customer)", async () => {
      await mkProduct("P1", 10, 250);
      await Order.create({ orderNumber: "UAE-OLD00001", guest: true, status: "delivered", idempotencyKey: key(), items: [], address: ADDR, delivery: {}, totals: { total: 1 }, payment: { method: "cod", status: "cod_collected" } });
      const r = await guestOrder({ buy: { sku: "P1", qty: 2 } }) as { orderNumber: string };
      expect((await Order.findOne({ orderNumber: r.orderNumber }).lean())).toMatchObject({ offer: { kind: "tier", percent: 10, discount: 50 }, totals: { subtotal: 500, offerDiscount: 50, deliveryFee: 0, total: 450 } });
    });
    it("a better coupon wins and is consumed; a worse coupon is left unused", async () => {
      await mkProduct("P1", 10, 100);
      await Coupon.create({ code: "BIG", type: "fixed", value: 30 }); await Coupon.create({ code: "SMALL", type: "percent", value: 5 });
      const big = await guestOrder({ buy: { sku: "P1", qty: 1 }, couponCode: "BIG" }) as { orderNumber: string };
      expect((await Order.findOne({ orderNumber: big.orderNumber }).lean())).toMatchObject({ coupon: { code: "BIG", discount: 30 } });
      expect((await Coupon.findOne({ code: "BIG" }).lean())!.usedCount).toBe(1);
      await Order.deleteMany({}); // forget the order so this is a first order again
      const small = await guestOrder({ guestId: "buy-small", buy: { sku: "P1", qty: 1 }, couponCode: "SMALL" }) as { orderNumber: string };
      const so = await Order.findOne({ orderNumber: small.orderNumber }).lean();
      expect(so!.coupon).toBeUndefined();
      expect(so).toMatchObject({ offer: { kind: "first_order" } });
      expect((await Coupon.findOne({ code: "SMALL" }).lean())!.usedCount).toBe(0);
    });
    it("guest coupon limits are per phone number", async () => {
      await mkProduct("P1", 10, 100);
      await Coupon.create({ code: "ONCE", type: "fixed", value: 40, perCustomerLimit: 1 });
      const a = await guestOrder({ buy: { sku: "P1", qty: 1 }, couponCode: "ONCE" });
      expect(a.ok).toBe(true);
      expect(await guestOrder({ guestId: "buy-2", buy: { sku: "P1", qty: 1 }, couponCode: "ONCE" })).toMatchObject({ ok: false, error: "coupon_customer_limit" });
      expect(await guestOrder({ guestId: "buy-3", address: { ...ADDR, phone: "+971559876543" }, buy: { sku: "P1", qty: 1 }, couponCode: "ONCE" })).toMatchObject({ ok: true });
    });
    it("cancelling gives the coupon use back for guests too", async () => {
      await mkProduct("P1", 10, 100);
      await Coupon.create({ code: "ONCE", type: "fixed", value: 40, perCustomerLimit: 1 });
      const a = await guestOrder({ buy: { sku: "P1", qty: 1 }, couponCode: "ONCE" }) as { orderNumber: string };
      await updateOrderStatus({ orderNumber: a.orderNumber, to: "cancelled", actor: "system", note: "test", notify: false });
      expect(await CouponRedemption.countDocuments()).toBe(0);
      expect((await Coupon.findOne({ code: "ONCE" }).lean())!.usedCount).toBe(0);
    });
  });

  describe("order tracking", () => {
    it("returns the order only to someone holding its token", async () => {
      await mkProduct("P1", 10, 100);
      const r = await guestOrder({ buy: { sku: "P1", qty: 1 } }) as { orderNumber: string; trackToken: string };
      const o = await getOrderByToken(r.orderNumber, r.trackToken);
      expect(o).toMatchObject({ orderNumber: r.orderNumber, status: "confirmed" });
      expect(JSON.stringify(o)).not.toContain(r.trackToken); // the secret never travels in the view
      expect(await getOrderByToken(r.orderNumber, "x".repeat(24))).toBeNull();
      expect(await getOrderByToken(r.orderNumber, "")).toBeNull();
      expect(await getOrderByToken("UAE-ZZZZZZZZ", r.trackToken)).toBeNull();
    });
    it("shows the status the admin sets", async () => {
      await mkProduct("P1", 10, 100);
      const r = await guestOrder({ buy: { sku: "P1", qty: 1 } }) as { orderNumber: string; trackToken: string };
      await updateOrderStatus({ orderNumber: r.orderNumber, to: "processing", actor: "staff", notify: false });
      expect(await getOrderByToken(r.orderNumber, r.trackToken)).toMatchObject({ status: "processing" });
    });
  });

  describe("returns & exchanges", () => {
    async function deliveredOrder(opts: { daysAgo?: number; variants?: boolean; qty?: number } = {}) {
      await mkProduct("SHIRT", 10, 100, opts.variants === false ? {} : { variants: [{ sku: "SHIRT-M", label: L("M"), stock: 5 }, { sku: "SHIRT-L", label: L("L"), stock: 5 }] });
      if (opts.variants === false) await Product.updateOne({ sku: "SHIRT" }, { stock: 5 });
      const sku = opts.variants === false ? "SHIRT" : "SHIRT-M";
      const r = await guestOrder({ buy: { sku, qty: opts.qty ?? 2 } }) as { orderNumber: string; trackToken: string };
      await updateOrderStatus({ orderNumber: r.orderNumber, to: "processing", actor: "s", notify: false });
      await updateOrderStatus({ orderNumber: r.orderNumber, to: "packed", actor: "s", notify: false });
      await updateOrderStatus({ orderNumber: r.orderNumber, to: "out_for_delivery", actor: "s", notify: false });
      await updateOrderStatus({ orderNumber: r.orderNumber, to: "delivered", actor: "s", notify: false });
      if (opts.daysAgo) await Order.updateOne({ orderNumber: r.orderNumber, "timeline.status": "delivered" }, { $set: { "timeline.$.at": new Date(Date.now() - opts.daysAgo * 86_400_000) } });
      return { ...r, sku, order: (await Order.findOne({ orderNumber: r.orderNumber }).lean())! };
    }

    it("only opens after delivery and closes after 7 days", async () => {
      await mkProduct("P1", 10, 100);
      const r = await guestOrder({ buy: { sku: "P1", qty: 1 } }) as { orderNumber: string };
      const fresh = (await Order.findOne({ orderNumber: r.orderNumber }).lean())!;
      expect(returnWindow(fresh, 7)).toMatchObject({ open: false, reason: "not_delivered" });
      expect(await createReturn({ order: fresh, items: [{ sku: "P1", qty: 1 }], resolution: "credit", reason: "changed_mind" })).toMatchObject({ ok: false, error: "not_delivered" });
      const d = await deliveredOrder({ daysAgo: 8 });
      expect(await createReturn({ order: d.order, items: [{ sku: d.sku, qty: 1 }], resolution: "credit", reason: "changed_mind" })).toMatchObject({ ok: false, error: "window_closed" });
      await Product.deleteOne({ sku: "SHIRT" }); await Order.deleteMany({ orderNumber: { $ne: r.orderNumber } });
      const ok = await deliveredOrder({ daysAgo: 6 });
      expect(returnWindow(ok.order, 7).open).toBe(true);
    });

    it("store credit: request → approve → receive (restock) → complete issues a single-use coupon worth what was paid", async () => {
      const d = await deliveredOrder({ qty: 2 }); // 2 × 100 with first-order 10% = 20 off → 90 per unit paid
      const made = await createReturn({ order: d.order, items: [{ sku: d.sku, qty: 1 }], resolution: "credit", reason: "wrong_size" });
      expect(made.ok).toBe(true);
      const ret = (await ReturnRequest.findOne({ orderNumber: d.orderNumber }).lean())!;
      expect(ret.items[0]).toMatchObject({ qty: 1, value: 90 });
      const id = String(ret._id);
      expect(await completeReturn(id, "staff")).toMatchObject({ ok: false, error: "invalid_state" }); // can't skip steps
      expect(await reviewReturn(id, "approved", "staff")).toEqual({ ok: true });
      expect(await reviewReturn(id, "approved", "staff")).toMatchObject({ ok: false }); // not twice
      const stockBefore = (await Product.findOne({ sku: "SHIRT" }).lean())!.variants.find((v) => v.sku === "SHIRT-M")!.stock;
      expect(await receiveReturn(id, "staff", true)).toEqual({ ok: true });
      expect((await Product.findOne({ sku: "SHIRT" }).lean())!.variants.find((v) => v.sku === "SHIRT-M")!.stock).toBe(stockBefore + 1);
      expect(await InventoryMovement.countDocuments({ reason: "return_restock", delta: 1 })).toBe(1);
      const done = await completeReturn(id, "staff");
      expect(done).toMatchObject({ ok: true, creditAmount: 90 });
      const code = (done as { creditCode: string }).creditCode;
      expect(await Coupon.findOne({ code }).lean()).toMatchObject({ type: "fixed", value: 90, usageLimit: 1, perCustomerLimit: 1, active: true, public: false, stackWithSale: true });
      expect(await completeReturn(id, "staff")).toMatchObject({ ok: false, error: "invalid_state" }); // no second coupon
      expect(await Coupon.countDocuments({ code: /^CR-/ })).toBe(1);
    });

    it("the credit coupon can be spent on the next order", async () => {
      const d = await deliveredOrder({ qty: 1 });
      await createReturn({ order: d.order, items: [{ sku: d.sku, qty: 1 }], resolution: "credit", reason: "defective" });
      const id = String((await ReturnRequest.findOne({ orderNumber: d.orderNumber }).lean())!._id);
      await reviewReturn(id, "approved", "s"); await receiveReturn(id, "s", false);
      const { creditCode } = (await completeReturn(id, "s")) as { creditCode: string };
      const next = await guestOrder({ guestId: "buy-next", buy: { sku: "SHIRT-L", qty: 1 }, couponCode: creditCode });
      expect(next).toMatchObject({ ok: true });
      expect((await Coupon.findOne({ code: creditCode }).lean())!.usedCount).toBe(1);
      expect(await guestOrder({ guestId: "buy-next2", buy: { sku: "SHIRT-L", qty: 1 }, couponCode: creditCode })).toMatchObject({ ok: false }); // single use
    });

    it("exchange: swaps size at no cost, takes the replacement from stock, and refuses if it's sold out", async () => {
      const d = await deliveredOrder({ qty: 1 });
      expect(await createReturn({ order: d.order, items: [{ sku: d.sku, qty: 1, exchangeSku: "SHIRT-M" }], resolution: "exchange", reason: "wrong_size" })).toMatchObject({ ok: false, error: "invalid_exchange" }); // same variant
      expect(await createReturn({ order: d.order, items: [{ sku: d.sku, qty: 1, exchangeSku: "NOPE" }], resolution: "exchange", reason: "wrong_size" })).toMatchObject({ ok: false, error: "invalid_exchange" });
      await Product.updateOne({ sku: "SHIRT", "variants.sku": "SHIRT-L" }, { $set: { "variants.$.stock": 0 } });
      expect(await createReturn({ order: d.order, items: [{ sku: d.sku, qty: 1, exchangeSku: "SHIRT-L" }], resolution: "exchange", reason: "wrong_size" })).toMatchObject({ ok: false, error: "exchange_unavailable" });
      await Product.updateOne({ sku: "SHIRT", "variants.sku": "SHIRT-L" }, { $set: { "variants.$.stock": 3 } });
      expect((await createReturn({ order: d.order, items: [{ sku: d.sku, qty: 1, exchangeSku: "SHIRT-L" }], resolution: "exchange", reason: "wrong_size" })).ok).toBe(true);
      const id = String((await ReturnRequest.findOne({ orderNumber: d.orderNumber }).lean())!._id);
      await reviewReturn(id, "approved", "s"); await receiveReturn(id, "s", true);
      await Product.updateOne({ sku: "SHIRT", "variants.sku": "SHIRT-L" }, { $set: { "variants.$.stock": 0 } }); // sells out meanwhile
      expect(await completeReturn(id, "s")).toMatchObject({ ok: false, error: "out_of_stock" });
      expect((await ReturnRequest.findById(id).lean())!.status).toBe("received"); // rolled back, can retry
      await Product.updateOne({ sku: "SHIRT", "variants.sku": "SHIRT-L" }, { $set: { "variants.$.stock": 2 } });
      expect(await completeReturn(id, "s")).toMatchObject({ ok: true });
      expect((await Product.findOne({ sku: "SHIRT" }).lean())!.variants.find((v) => v.sku === "SHIRT-L")!.stock).toBe(1);
      expect(await Coupon.countDocuments({ code: /^CR-/ })).toBe(0); // exchange issues no credit
    });

    it("can't return more than was bought, the same item twice, or items from another order", async () => {
      const d = await deliveredOrder({ qty: 2 });
      expect(await createReturn({ order: d.order, items: [{ sku: d.sku, qty: 3 }], resolution: "credit", reason: "other" })).toMatchObject({ ok: false, error: "invalid_items" });
      expect(await createReturn({ order: d.order, items: [{ sku: "OTHER", qty: 1 }], resolution: "credit", reason: "other" })).toMatchObject({ ok: false, error: "invalid_items" });
      expect(await createReturn({ order: d.order, items: [], resolution: "credit", reason: "other" })).toMatchObject({ ok: false, error: "invalid_items" });
      expect((await createReturn({ order: d.order, items: [{ sku: d.sku, qty: 2 }], resolution: "credit", reason: "other" })).ok).toBe(true);
      expect(await createReturn({ order: d.order, items: [{ sku: d.sku, qty: 1 }], resolution: "credit", reason: "other" })).toMatchObject({ ok: false, error: "invalid_items" }); // all already requested
    });

    it("a rejected return frees the items to be requested again", async () => {
      const d = await deliveredOrder({ qty: 1 });
      await createReturn({ order: d.order, items: [{ sku: d.sku, qty: 1 }], resolution: "credit", reason: "other" });
      const id = String((await ReturnRequest.findOne({ orderNumber: d.orderNumber }).lean())!._id);
      await reviewReturn(id, "rejected", "s", "Used item");
      expect((await createReturn({ order: d.order, items: [{ sku: d.sku, qty: 1 }], resolution: "credit", reason: "other" })).ok).toBe(true);
    });

    it("products without variants can only be returned for credit", async () => {
      const d = await deliveredOrder({ variants: false, qty: 1 });
      expect(await createReturn({ order: d.order, items: [{ sku: d.sku, qty: 1, exchangeSku: "SHIRT-L" }], resolution: "exchange", reason: "wrong_size" })).toMatchObject({ ok: false, error: "invalid_exchange" });
    });
  });

  describe("lead capture", () => {
    it("stores a lead once per email/phone and only records consent when given", async () => {
      await captureLead({ email: "a@b.co", source: "welcome_modal", locale: "en", consent: false });
      await captureLead({ email: "a@b.co", phone: "+971501234567", source: "newsletter", locale: "en", consent: true });
      await captureLead({ phone: "+971501234567", source: "welcome_modal", locale: "ar", consent: false });
      expect(await Lead.countDocuments()).toBe(1);
      expect(await Lead.findOne().lean()).toMatchObject({ email: "a@b.co", phone: "+971501234567", marketingConsent: true, source: "welcome_modal" });
      expect(await captureLead({ source: "welcome_modal", locale: "en", consent: true })).toBeNull();
    });
  });
});
