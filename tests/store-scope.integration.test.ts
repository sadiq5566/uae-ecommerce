// Shared-database safety net, against a REAL local MongoDB (database "souq_uae_test_scope", wiped here). Skipped if Mongo is down.
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
process.env.MONGODB_DB = "souq_uae_test_scope";
const up = await mongoose.connect(process.env.MONGODB_URI, { dbName: "souq_uae_test_scope", serverSelectionTimeoutMS: 1500 }).then(() => true, () => false);

const { Order } = await import("@/models/order");
const { User } = await import("@/models/user");
const { Counter, nextOrderNumber } = await import("@/models/counter");
const { allStores, aggregateAllStores } = await import("@/lib/store-scope");

const as = (store: string, prefix: string) => { process.env.STORE_ID = store; process.env.ORDER_PREFIX = prefix; };
const A = () => as("storea", "SA");
const B = () => as("storeb", "SB");
let k = 0;
const mkOrder = (orderNumber: string, total = 100) => Order.create({ orderNumber, idempotencyKey: `k-${++k}-${"x".repeat(16)}`, status: "confirmed", guest: true, totals: { total }, payment: { method: "cod", status: "cod_pending" } } as never);

describe.skipIf(!up)("shared database: store scoping", () => {
  beforeAll(async () => {
    await mongoose.connection.dropDatabase();
    await Promise.all([Order.createIndexes(), User.createIndexes()]);
  }, 60_000);
  afterAll(async () => { delete process.env.USE_SHARED_DB; await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  beforeEach(async () => {
    process.env.USE_SHARED_DB = "true";
    for (const c of await mongoose.connection.db!.collections()) await c.deleteMany({});
  });

  it("order numbers stay unique and gapless under 50 parallel creates", async () => {
    A();
    const nums = await Promise.all(Array.from({ length: 50 }, () => nextOrderNumber()));
    expect(new Set(nums).size).toBe(50);
    expect(nums.sort()).toEqual(Array.from({ length: 50 }, (_, i) => `SA-${1001 + i}`).sort());
    B();
    expect(await nextOrderNumber()).toBe("SB-1001"); // each store counts on its own
    expect((await Counter.findById("storea:order").lean())?.seq).toBe(1050);
  });

  it("50 parallel orders created through the model all get distinct numbers", async () => {
    A();
    const made = await Promise.all(Array.from({ length: 50 }, async () => mkOrder(await nextOrderNumber())));
    expect(new Set(made.map((o) => o.orderNumber)).size).toBe(50);
  });

  it("new documents always get the current store id (a caller cannot choose another)", async () => {
    A();
    const o = await mkOrder("SA-1");
    expect(o.storeId).toBe("storea");
    const forged = await Order.create({ orderNumber: "SA-2", storeId: "storeb", idempotencyKey: `k-${++k}-${"x".repeat(16)}`, status: "confirmed", guest: true, totals: { total: 1 }, payment: { method: "cod", status: "cod_pending" } } as never);
    expect(forged.storeId).toBe("storea");
  });

  it("store A cannot read store B's orders (find, findOne, count, distinct)", async () => {
    A(); await mkOrder("SA-1"); await mkOrder("SA-2");
    B(); await mkOrder("SB-1");
    A();
    expect((await Order.find().lean()).map((o) => o.orderNumber).sort()).toEqual(["SA-1", "SA-2"]);
    expect(await Order.findOne({ orderNumber: "SB-1" }).lean()).toBeNull();
    expect(await Order.countDocuments()).toBe(2);
    expect((await Order.find({ storeId: "storeb" }).lean()).every((o) => o.storeId === "storea")).toBe(true); // asking for another store explicitly is forced back to this one
    expect((await Order.distinct("orderNumber")).sort()).toEqual(["SA-1", "SA-2"]);
    B();
    expect(await Order.countDocuments()).toBe(1);
  });

  it("updates and deletes only touch the current store's rows", async () => {
    A(); await mkOrder("SAME-1");
    B(); await mkOrder("SAME-1"); // same order number in two stores is allowed (unique per store)
    A();
    expect((await Order.updateMany({}, { $set: { source: "buy_now" } })).modifiedCount).toBe(1);
    expect(await Order.findOneAndUpdate({ orderNumber: "SAME-1" }, { $set: { locale: "ar" } }, { returnDocument: "after" }).lean()).toMatchObject({ storeId: "storea", locale: "ar" });
    B();
    expect(await Order.findOne({ orderNumber: "SAME-1" }).lean()).toMatchObject({ storeId: "storeb", locale: "en", source: "cart" });
    A();
    expect((await Order.deleteMany({})).deletedCount).toBe(1);
    B();
    expect(await Order.countDocuments()).toBe(1);
  });

  it("aggregate is scoped, even when the pipeline forgets a $match", async () => {
    A(); await mkOrder("SA-1", 100); await mkOrder("SA-2", 50);
    B(); await mkOrder("SB-1", 1000);
    A();
    const [sum] = await Order.aggregate([{ $group: { _id: null, revenue: { $sum: "$totals.total" }, n: { $sum: 1 } } }]);
    expect(sum).toMatchObject({ revenue: 150, n: 2 });
    B();
    const [sumB] = await Order.aggregate([{ $match: { status: "confirmed" } }, { $group: { _id: null, revenue: { $sum: "$totals.total" } } }]);
    expect(sumB.revenue).toBe(1000);
  });

  it("customers are shared: one account works in every store, and an email exists only once", async () => {
    A(); const u = await User.create({ email: "x@y.com", name: "A", passwordHash: "h" });
    B();
    expect(await User.findOne({ email: "x@y.com" }).lean()).toMatchObject({ _id: u._id }); // same login in store B
    await expect(User.create({ email: "x@y.com", name: "B2", passwordHash: "h" })).rejects.toMatchObject({ code: 11000 });
  });

  it("allStores() / aggregateAllStores() work only for the owner", async () => {
    A(); await mkOrder("SA-1", 10); B(); await mkOrder("SB-1", 20); A();
    expect(() => allStores(Order.find() as never, { role: "operations_manager" })).toThrow(/super-admin/);
    expect(await allStores(Order.find() as never, { role: "owner" })).toHaveLength(2);
    const [sum] = await aggregateAllStores(Order, [{ $group: { _id: null, t: { $sum: "$totals.total" } } }], { role: "owner" });
    expect(sum.t).toBe(30);
  });

  it("with USE_SHARED_DB off nothing is filtered (old single-store database behaviour)", async () => {
    A(); await mkOrder("SA-1"); B(); await mkOrder("SB-1");
    process.env.USE_SHARED_DB = "false";
    expect(await Order.countDocuments()).toBe(2);
  });
});
