// Admin & content integration tests against a REAL local MongoDB (database "souq_uae_test_admin"). Skipped if Mongo is down.
// Server actions are called directly with a mocked session so authorization and business rules are exercised end to end.
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT:${u}`); }, notFound: () => { throw new Error("NOTFOUND"); } }));
let session: { id: string; email: string; name: string; role: "customer" | "owner" | "catalog_manager" | "operations_manager" | "content_editor"; locale: "en" } | null = null;
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => session, destroyAllSessions: async (id: string) => { (globalThis as { __killed?: string[] }).__killed = [...((globalThis as { __killed?: string[] }).__killed ?? []), id]; } }));
process.env.MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
process.env.MONGODB_DB = "souq_uae_test_admin";
process.env.IMAGE_HOSTS = "cdn.example.com";

const up = await mongoose.connect(process.env.MONGODB_URI, { dbName: "souq_uae_test_admin", serverSelectionTimeoutMS: 1500 }).then(() => true, () => false);

const A = up ? {
  catalog: await import("@/features/admin/catalog/actions"),
  orders: await import("@/features/admin/orders/actions"),
  people: await import("@/features/admin/people/actions"),
  reviewsAdmin: await import("@/features/admin/reviews/actions"),
  commerce: await import("@/features/admin/commerce/actions"),
  content: await import("@/features/admin/content/actions"),
  csv: await import("@/features/admin/csv/actions"),
  reviews: await import("@/features/reviews/actions"),
  reviewSvc: await import("@/features/reviews/service"),
  maint: await import("@/features/catalog/maintenance"),
  place: await import("@/features/orders/place"),
  life: await import("@/features/orders/lifecycle"),
} : ({} as never);
const M = up ? {
  User: (await import("@/models/user")).User, Product: (await import("@/models/product")).Product, Category: (await import("@/models/category")).Category,
  Order: (await import("@/models/order")).Order, Review: (await import("@/models/review")).Review, AuditLog: (await import("@/models/audit-log")).AuditLog,
  Movement: (await import("@/models/inventory-movement")).InventoryMovement, Coupon: (await import("@/models/coupon")).Coupon, Cart: (await import("@/models/cart")).Cart,
  Address: (await import("@/models/address")).Address, Zone: (await import("@/models/delivery-zone")).DeliveryZone, Settings: (await import("@/models/settings")).Settings,
  Article: (await import("@/models/article")).Article, Page: (await import("@/models/content-page")).ContentPage,
} : ({} as never);

const L = (en: string) => ({ en, ar: en + " ar" });
const fd = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, x)); return f; };
const as = async (role: "customer" | "owner" | "catalog_manager" | "operations_manager" | "content_editor") => { const u = await M.User.create({ email: `${role}-${Math.random().toString(36).slice(2, 7)}@t.test`, name: `${role} user`, role, passwordHash: "x" }); session = { id: String(u._id), email: u.email, name: u.name, role, locale: "en" }; return session; };
const guest = () => { session = null; };
let cat: string;
const productForm = (o: Record<string, string> = {}) => ({ slug: "phone-1", sku: "PH-1", name_en: "Phone", name_ar: "هاتف", description_en: "", description_ar: "", category: cat, price: "100", stock: "5", lowStockThreshold: "5", status: "draft", hue: "160", icon: "📦", tags: "", images: "[]", variants: "[]", specs: "[]", attrs: "{}", seoTitle_en: "", seoTitle_ar: "", seoDesc_en: "", seoDesc_ar: "", ...o });
const redirects = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const m = (e as Error).message; if (m.startsWith("REDIRECT:")) return m.slice(9); throw e; } };

describe.skipIf(!up)("admin (real MongoDB)", () => {
  const models = () => Object.values(M) as unknown as mongoose.Model<unknown>[];
  beforeAll(async () => { await mongoose.connection.dropDatabase(); await Promise.all(models().map((m) => m.createIndexes())); }, 60_000);
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  beforeEach(async () => {
    for (const c of await mongoose.connection.db!.collections()) await c.deleteMany({});
    cat = String((await M.Category.create({ slug: "phones", name: L("Phones"), attributes: [{ key: "color", label: L("Colour") }] }))._id);
    await M.Settings.create({ key: "store" });
    (globalThis as { __killed?: string[] }).__killed = [];
  });

  describe("authorization is enforced on the server for every action", () => {
    it("rejects guests and customers on every admin action", async () => {
      const results: unknown[] = [];
      for (const who of ["guest", "customer"]) {
        if (who === "guest") guest(); else await as("customer");
        results.push(
          await A.catalog.saveProductAction({}, fd(productForm())), await A.catalog.saveCategoryAction({}, fd({ slug: "x", name_en: "X", name_ar: "إكس" })),
          await A.catalog.adjustStockAction({}, fd({ productId: cat, sku: "X", mode: "delta", value: "1", reason: "restock" })),
          await A.orders.changeStatusAction({}, fd({ orderNumber: "X", to: "processing" })), await A.orders.requestRefundAction({}, fd({ orderNumber: "X", note: "n" })),
          await A.people.setRoleAction({}, fd({ email: "a@b.co", role: "owner" })), await A.commerce.saveCouponAction({}, fd({ code: "ABC" })),
          await A.commerce.saveZoneAction({}, fd({ key: "zz" })), await A.commerce.saveSettingsAction({}, fd({})), await A.content.saveArticleAction({}, fd({})),
          await A.content.savePageAction({}, fd({})), await A.content.saveHomepageAction({}, fd({ banners: "[]" })),
        );
        expect((await A.csv.importBatchAction("products", ["sku"], [{ line: 2, data: { sku: "X1" } }])).ok).toBe(false);
        expect((await A.csv.previewImportAction(null, fd({ kind: "products" })))).toMatchObject({ ok: false });
      }
      for (const r of results) expect(r).toMatchObject({ error: "You don't have permission to do that." });
      expect(await M.Product.countDocuments()).toBe(0);
      expect(await M.AuditLog.countDocuments()).toBe(0);
    });

    it("applies least privilege between staff roles", async () => {
      await as("content_editor");
      expect(await A.catalog.saveProductAction({}, fd(productForm()))).toMatchObject({ error: expect.stringContaining("permission") });
      await as("catalog_manager");
      expect(await A.orders.changeStatusAction({}, fd({ orderNumber: "X", to: "processing" }))).toMatchObject({ error: expect.stringContaining("permission") });
      expect(await A.commerce.saveSettingsAction({}, fd({}))).toMatchObject({ error: expect.stringContaining("permission") });
      await as("operations_manager");
      expect(await A.catalog.saveProductAction({}, fd(productForm()))).toMatchObject({ error: expect.stringContaining("permission") });
      expect(await A.people.setRoleAction({}, fd({ email: "a@b.co", role: "owner" }))).toMatchObject({ error: expect.stringContaining("permission") });
      await as("content_editor");
      expect(await A.content.saveHomepageAction({}, fd({ banners: "[]" }))).toMatchObject({ ok: true });
    });
  });

  describe("products", () => {
    it("creates a product with validation, initial stock movement and audit entry", async () => {
      const u = await as("catalog_manager");
      const bad = await A.catalog.saveProductAction({}, fd(productForm({ price: "-1", salePrice: "50", name_en: "" })));
      expect(bad.fieldErrors).toMatchObject({ price: expect.any(String), name_en: expect.any(String) });
      expect(await redirects(A.catalog.saveProductAction({}, fd(productForm())))).toBe("/admin/products?saved=1");
      const p = (await M.Product.findOne({ sku: "PH-1" }).lean())!;
      expect(p).toMatchObject({ slug: "phone-1", stock: 5, finalPrice: 100, status: "draft" });
      expect(await M.Movement.findOne({ product: p._id })).toMatchObject({ delta: 5, reason: "restock" });
      expect(await M.AuditLog.findOne({ action: "product.create" })).toMatchObject({ actorEmail: u.email });
    });

    it("rejects duplicate SKU/slug and sale ≥ price, image hosts not on the allowlist", async () => {
      await as("catalog_manager");
      await redirects(A.catalog.saveProductAction({}, fd(productForm())));
      expect((await A.catalog.saveProductAction({}, fd(productForm({ slug: "other" })))).fieldErrors?.sku).toMatch(/already/);
      expect((await A.catalog.saveProductAction({}, fd(productForm({ sku: "PH-2" })))).fieldErrors?.slug).toMatch(/already/);
      expect((await A.catalog.saveProductAction({}, fd(productForm({ sku: "PH-3", slug: "p3", salePrice: "100" })))).fieldErrors?.salePrice).toMatch(/lower/);
      const img = JSON.stringify([{ url: "https://evil.example.org/x.png", alt: { en: "", ar: "" } }]);
      expect((await A.catalog.saveProductAction({}, fd(productForm({ sku: "PH-4", slug: "p4", images: img })))).fieldErrors?.images).toMatch(/allowed host/);
    });

    it("keeps old slugs for redirects, logs stock edits, and derives stock from variants", async () => {
      await as("catalog_manager");
      await redirects(A.catalog.saveProductAction({}, fd(productForm())));
      const id = String((await M.Product.findOne({ sku: "PH-1" }))!._id);
      const variants = JSON.stringify([{ sku: "PH-1-A", label: { en: "A", ar: "أ" }, stock: 3 }, { sku: "PH-1-B", label: { en: "B", ar: "ب" }, stock: 4, price: 90 }]);
      expect(await A.catalog.saveProductAction({}, fd(productForm({ id, slug: "phone-new", variants })))).toMatchObject({ ok: true });
      const p = (await M.Product.findById(id).lean())!;
      expect(p.slug).toBe("phone-new");
      expect(p.slugHistory).toContain("phone-1");
      expect(p.stock).toBe(7);
      // a disabled stock input is not submitted by browsers: must not be an error when variants exist
      const noStock = productForm({ id, slug: "phone-new", variants }) as Record<string, string>; delete noStock.stock;
      expect(await A.catalog.saveProductAction({}, fd(noStock))).toMatchObject({ ok: true });
      expect((await A.catalog.saveProductAction({}, fd(productForm({ id, slug: "phone-new", variants: JSON.stringify([{ sku: "PH-1", label: { en: "x", ar: "x" }, stock: 1 }]) })))).fieldErrors?.variants).toMatch(/can't equal/);
      expect(await M.Movement.countDocuments({ product: id, reason: "manual_adjustment" })).toBeGreaterThan(0);
    });

    it("stock adjustments: set/delta, never negative, conditional on current stock, logged with actor", async () => {
      await as("catalog_manager");
      await redirects(A.catalog.saveProductAction({}, fd(productForm())));
      const id = String((await M.Product.findOne({ sku: "PH-1" }))!._id);
      const adj = (o: Record<string, string>) => A.catalog.adjustStockAction({}, fd({ productId: id, sku: "PH-1", reason: "restock", ...o }));
      expect(await adj({ mode: "delta", value: "10" })).toMatchObject({ ok: true });
      expect(await adj({ mode: "set", value: "3" })).toMatchObject({ ok: true });
      expect((await M.Product.findById(id))!.stock).toBe(3);
      expect((await adj({ mode: "delta", value: "-4" })).fieldErrors?.value).toMatch(/below 0/);
      expect((await adj({ mode: "set", value: "3" })).fieldErrors?.value).toMatch(/No change/);
      expect((await M.Movement.find({ product: id }).sort({ createdAt: 1 }).lean()).map((m) => m.delta)).toEqual([5, 10, -12]);
    });

    it("bulk actions: publish works; published products cannot be bulk-deleted", async () => {
      await as("catalog_manager");
      const ps = await M.Product.create([{ slug: "a", sku: "A-1", name: L("A"), category: cat, price: 10, stock: 1, status: "draft" }, { slug: "b", sku: "B-1", name: L("B"), category: cat, price: 10, stock: 1, status: "published" }]);
      await A.catalog.bulkProductsAction(fd({ op: "delete", ids: ps.map((p) => String(p._id)) }));
      expect(await M.Product.countDocuments()).toBe(1);
      expect((await M.Product.findOne())!.status).toBe("published");
      await A.catalog.bulkProductsAction(fd({ op: "archive", ids: [String(ps[1]._id)] }));
      expect((await M.Product.findOne())!.status).toBe("archived");
    });
  });

  describe("categories", () => {
    it("prevents circular parents and unsafe deletion", async () => {
      await as("catalog_manager");
      const parent = await M.Category.create({ slug: "parent-cat", name: L("Parent") });
      const child = await M.Category.create({ slug: "child-cat", name: L("Child"), parent: parent._id });
      const base = { name_en: "Parent", name_ar: "الأب", desc_en: "", desc_ar: "", icon: "📁", hue: "160", order: "0", attributes: "[]", seoTitle_en: "", seoTitle_ar: "", seoDesc_en: "", seoDesc_ar: "" };
      const cyc = await A.catalog.saveCategoryAction({}, fd({ ...base, id: String(parent._id), slug: "parent-cat", parent: String(child._id) }));
      expect(cyc.fieldErrors?.parent).toMatch(/itself or one of its own/);
      expect((await A.catalog.saveCategoryAction({}, fd({ ...base, id: String(parent._id), slug: "parent-cat", parent: String(parent._id) }))).fieldErrors?.parent).toBeTruthy();
      await M.Product.create({ slug: "x", sku: "X-1", name: L("X"), category: child._id, price: 1, stock: 1, status: "published" });
      expect(await redirects(A.catalog.deleteCategoryAction(fd({ id: String(child._id) })))).toMatch(/blocked=products/);
      expect(await redirects(A.catalog.deleteCategoryAction(fd({ id: String(parent._id) })))).toMatch(/blocked=children/);
      expect(await M.Category.countDocuments()).toBe(3);
    });
  });

  describe("orders operations", () => {
    async function codOrder() {
      const cust = await M.User.create({ email: "c@t.test", name: "Cust", passwordHash: "x" });
      const addr = await M.Address.create({ user: cust._id, recipientName: "C", phone: "+971501234567", emirate: "dubai", area: "A", building: "B" });
      await M.Zone.create({ key: "m", name: L("M"), emirates: ["dubai"], fee: 15, estimate: L("1d") });
      const p = await M.Product.create({ slug: "po", sku: "PO-1", name: L("P"), category: cat, price: 100, stock: 5, status: "published" });
      await M.Cart.create({ user: cust._id, items: [{ sku: "PO-1", qty: 2, priceAtAdd: 100 }] });
      const r = await A.place.placeOrder({ userId: String(cust._id), email: cust.email, locale: "en", addressId: String(addr._id), method: "cod", idempotencyKey: "k".repeat(20), returnBase: "http://x" });
      return { orderNumber: (r as { orderNumber: string }).orderNumber, cust, p };
    }
    it("ops can move orders along; invalid moves and missing cancel notes are rejected; everything is audited", async () => {
      process.env.PAYMENT_PROVIDER = "";
      const { orderNumber, p } = await codOrder();
      await as("operations_manager");
      expect(await A.orders.changeStatusAction({}, fd({ orderNumber, to: "delivered" }))).toMatchObject({ error: expect.stringContaining("isn't allowed") });
      expect(await A.orders.changeStatusAction({}, fd({ orderNumber, to: "cancelled" }))).toMatchObject({ error: expect.stringContaining("note") });
      expect(await A.orders.changeStatusAction({}, fd({ orderNumber, to: "processing" }))).toMatchObject({ ok: true });
      expect(await A.orders.changeStatusAction({}, fd({ orderNumber, to: "cancelled", note: "customer asked" }))).toMatchObject({ ok: true });
      expect((await M.Product.findById(p._id))!.stock).toBe(5); // stock restored
      expect(await M.AuditLog.countDocuments({ action: "order.status" })).toBe(2);
    });
    it("refunds: only for collected money; COD refund needs a reference; completion goes through refund_pending", async () => {
      const { orderNumber } = await codOrder();
      await as("operations_manager");
      expect(await A.orders.requestRefundAction({}, fd({ orderNumber, note: "x" }))).toHaveProperty("error"); // nothing collected yet → not refundable
      for (const to of ["processing", "packed", "out_for_delivery", "delivered"]) await A.orders.changeStatusAction({}, fd({ orderNumber, to }));
      expect((await M.Order.findOne({ orderNumber }))!.payment.status).toBe("cod_collected");
      expect(await A.orders.requestRefundAction({}, fd({ orderNumber, note: "" }))).toMatchObject({ error: expect.stringContaining("reason") });
      expect(await A.orders.requestRefundAction({}, fd({ orderNumber, note: "damaged" }))).toMatchObject({ ok: true });
      expect((await M.Order.findOne({ orderNumber }))!.status).toBe("refund_pending");
      expect(await A.orders.completeManualRefundAction({}, fd({ orderNumber, note: "ab" }))).toMatchObject({ error: expect.stringContaining("reference") });
      expect(await A.orders.completeManualRefundAction({}, fd({ orderNumber, note: "cash receipt #123" }))).toMatchObject({ ok: true });
      expect((await M.Order.findOne({ orderNumber }))).toMatchObject({ status: "refunded", payment: { status: "refunded" } });
    });
    it("generic status change cannot jump straight to 'refunded'", async () => {
      const { orderNumber } = await codOrder();
      await as("owner");
      expect(await A.orders.changeStatusAction({}, fd({ orderNumber, to: "refunded" }))).toMatchObject({ error: expect.stringContaining("refund controls") });
    });
  });

  describe("people & roles", () => {
    it("only owners change roles; can't change own role or remove the last owner; role change signs the user out", async () => {
      const me = await as("owner");
      const target = await M.User.create({ email: "t@t.test", name: "T", passwordHash: "x" });
      expect(await A.people.setRoleAction({}, fd({ email: "t@t.test", role: "catalog_manager" }))).toMatchObject({ ok: true });
      expect((await M.User.findById(target._id))!.role).toBe("catalog_manager");
      expect((globalThis as { __killed?: string[] }).__killed).toContain(String(target._id));
      expect((await A.people.setRoleAction({}, fd({ email: me.email, role: "customer" }))).fieldErrors?.email).toMatch(/own role/);
      expect((await A.people.setRoleAction({}, fd({ email: "nobody@t.test", role: "owner" }))).fieldErrors?.email).toMatch(/No account/);
      await A.people.setRoleAction({}, fd({ email: "t@t.test", role: "owner" }));
      session = { id: String(target._id), email: "t@t.test", name: "T", role: "owner", locale: "en" };
      expect(await A.people.setRoleAction({}, fd({ email: me.email, role: "customer" }))).toMatchObject({ ok: true }); // two owners → allowed
      expect((await A.people.setRoleAction({}, fd({ email: "x@x.co", role: "customer" }))).fieldErrors?.email).toBeTruthy();
    });
    it("last active owner can't be demoted", async () => {
      await M.User.create({ email: "solo@t.test", name: "Solo", role: "owner", passwordHash: "x" });
      await as("owner"); // second owner (the actor)
      const other = await M.User.findOne({ email: "solo@t.test" });
      await M.User.updateOne({ _id: session!.id }, { status: "disabled" }); // actor disabled → solo is the only ACTIVE owner
      expect((await A.people.setRoleAction({}, fd({ email: other!.email, role: "customer" }))).fieldErrors?.role).toMatch(/at least one owner/);
    });
    it("disabling a customer signs them out; staff can't be disabled this way", async () => {
      await as("owner");
      const c = await M.User.create({ email: "c@t.test", name: "C", passwordHash: "x" });
      await A.people.setCustomerStatusAction(fd({ id: String(c._id), status: "disabled" }));
      expect((await M.User.findById(c._id))!.status).toBe("disabled");
      expect((globalThis as { __killed?: string[] }).__killed).toContain(String(c._id));
      const staff = await M.User.create({ email: "s@t.test", name: "S", role: "catalog_manager", passwordHash: "x" });
      await A.people.setCustomerStatusAction(fd({ id: String(staff._id), status: "disabled" }));
      expect((await M.User.findById(staff._id))!.status).toBe("active");
      await as("operations_manager");
      await A.people.setCustomerStatusAction(fd({ id: String(c._id), status: "active" }));
      expect((await M.User.findById(c._id))!.status).toBe("disabled");
    });
  });

  describe("CSV import", () => {
    it("creates/updates in batches, reports bad rows, never overwrites unspecified fields, logs stock changes", async () => {
      await as("catalog_manager");
      const present = ["sku", "name_en", "name_ar", "category_slug", "price", "stock", "attributes"];
      const row = (o: Record<string, string>) => ({ sku: "", name_en: "", name_ar: "", category_slug: "", price: "", stock: "", attributes: "", ...o });
      const res = await A.csv.importBatchAction("products", present, [
        { line: 2, data: row({ sku: "csv-1", name_en: "=HYPERLINK(\"x\")", name_ar: "اسم", category_slug: "phones", price: "50", stock: "4", attributes: "color:Black" }) },
        { line: 3, data: row({ sku: "csv-2", name_en: "Bad", name_ar: "س", category_slug: "nope", price: "abc" }) },
      ]);
      expect(res.results.map((r) => r.status)).toEqual(["created", "failed"]);
      expect(res.results[1].errors.join()).toMatch(/unknown category_slug/);
      const p = (await M.Product.findOne({ sku: "CSV-1" }).lean())!;
      expect(p).toMatchObject({ status: "draft", stock: 4, finalPrice: 50, slug: "hyperlink-x" });
      expect(p.name?.en).toBe("=HYPERLINK(\"x\")"); // stored verbatim, never evaluated
      expect(await M.Movement.countDocuments({ sku: "CSV-1", reason: "restock" })).toBe(1);
      const up = await A.csv.importBatchAction("products", ["sku", "price"], [{ line: 2, data: { sku: "CSV-1", price: "60" } }]);
      expect(up.results[0].status).toBe("updated");
      const after = (await M.Product.findOne({ sku: "CSV-1" }).lean())!;
      expect(after).toMatchObject({ price: 60, finalPrice: 60, stock: 4 }); // name/stock untouched
      expect(after.name?.en).toBe("=HYPERLINK(\"x\")");
      expect(await M.AuditLog.countDocuments({ action: "product.csv_import" })).toBe(2);
    });
    it("preview rejects oversized/malformed files and requires the key column", async () => {
      await as("catalog_manager");
      const file = (body: string, name = "p.csv") => { const f = new FormData(); f.append("kind", "products"); f.append("file", new File([body], name, { type: "text/csv" })); return f; };
      expect(await A.csv.previewImportAction(null, file("name_en\nx"))).toMatchObject({ ok: false, error: expect.stringContaining("sku") });
      expect(await A.csv.previewImportAction(null, file('sku\n"unterminated'))).toMatchObject({ ok: false });
      expect(await A.csv.previewImportAction(null, file("x".repeat(3 * 1024 * 1024)))).toMatchObject({ ok: false, error: expect.stringContaining("too large") });
      const ok = await A.csv.previewImportAction(null, file("sku,name_en,name_ar,category_slug,price\nA-1,N,ن,phones,5\nA-1,N,ن,phones,5\n"));
      expect(ok).toMatchObject({ ok: true });
      if (ok?.ok) expect(ok.issues.map((i) => i.action)).toEqual(["create", "error"]);
    });
    it("category import enforces two levels and parent-first order", async () => {
      await as("catalog_manager");
      const cols = ["slug", "parent_slug", "name_en", "name_ar"];
      const r = await A.csv.importBatchAction("categories", cols, [{ line: 2, data: { slug: "tops", parent_slug: "", name_en: "Tops", name_ar: "قمم" } }, { line: 3, data: { slug: "tees", parent_slug: "tops", name_en: "Tees", name_ar: "تيشيرت" } }, { line: 4, data: { slug: "deep", parent_slug: "tees", name_en: "Deep", name_ar: "عميق" } }]);
      expect(r.results.map((x) => x.status)).toEqual(["created", "created", "failed"]);
      expect((await M.Category.findOne({ slug: "tees" }))!.parent).toBeTruthy();
    });
  });

  describe("promotions, zones, settings", () => {
    it("validates coupons (unknown SKU, percent range, duplicate code) and locks the code once used", async () => {
      await as("catalog_manager");
      const base = { code: "save10", type: "percent", value: "10", minSubtotal: "0", perCustomerLimit: "1", desc_en: "", desc_ar: "", productSkus: "", excludeSkus: "" };
      expect((await A.commerce.saveCouponAction({}, fd({ ...base, productSkus: "NOPE-1" }))).fieldErrors?.productSkus).toMatch(/Unknown SKU/);
      expect((await A.commerce.saveCouponAction({}, fd({ ...base, value: "150" }))).fieldErrors?.value).toMatch(/0 and 100/);
      expect(await redirects(A.commerce.saveCouponAction({}, fd(base)))).toBe("/admin/promotions?saved=1");
      expect((await M.Coupon.findOne({ code: "SAVE10" }))).toBeTruthy();
      expect((await A.commerce.saveCouponAction({}, fd(base))).fieldErrors?.code).toMatch(/exists/);
      const c = (await M.Coupon.findOne({ code: "SAVE10" }))!; c.usedCount = 2; await c.save();
      expect((await A.commerce.saveCouponAction({}, fd({ ...base, id: String(c._id), code: "OTHER" }))).fieldErrors?.code).toMatch(/can't be changed/);
      await redirects(A.commerce.deleteCouponAction(fd({ id: String(c._id) })));
      expect((await M.Coupon.findById(c._id))!.active).toBe(false); // used coupons are deactivated, not deleted
    });
    it("delivery zones can't overlap on active emirates; settings are validated and audited", async () => {
      await as("operations_manager");
      const z = { name_en: "Zone", name_ar: "منطقة", fee: "10", est_en: "1d", est_ar: "يوم", active: "on" };
      expect(await A.commerce.saveZoneAction({}, fd({ ...z, key: "one", emirates: ["dubai", "sharjah"] }))).toMatchObject({ ok: true });
      expect((await A.commerce.saveZoneAction({}, fd({ ...z, key: "two", emirates: ["sharjah"] }))).fieldErrors?.emirates).toMatch(/already covered/);
      expect((await A.commerce.saveZoneAction({}, fd({ ...z, key: "three", emirates: [] }))).fieldErrors?.emirates).toBeTruthy();
      await as("owner");
      const s = { storeName_en: "Shop", storeName_ar: "متجر", minOrder: "50", freeDeliveryThreshold: "200", baseDeliveryFee: "15", codFee: "5", codMaxOrder: "0", taxRate: "5", pendingPaymentMinutes: "30", codEnabled: "on" };
      expect(await A.commerce.saveSettingsAction({}, fd({ ...s, supportEmail: "bad" }))).toMatchObject({ fieldErrors: { supportEmail: expect.any(String) } });
      expect(await A.commerce.saveSettingsAction({}, fd({ ...s, taxEnabled: "on" }))).toMatchObject({ ok: true });
      expect((await M.Settings.findOne({ key: "store" }).lean())).toMatchObject({ codFee: 5, tax: { enabled: true, rate: 0.05 } });
      expect(await M.AuditLog.countDocuments({ action: "settings.update" })).toBe(1);
    });
  });

  describe("content", () => {
    it("articles: published need both languages, slug unique, scheduling by publishAt; pages only for known slugs", async () => {
      await as("content_editor");
      const a = { slug: "hello", title_en: "Hello", title_ar: "مرحبا", excerpt_en: "", excerpt_ar: "", body_en: "Body", body_ar: "", status: "published", hue: "160", icon: "📰", category: "", author: "", coverAlt_en: "", coverAlt_ar: "", seoTitle_en: "", seoTitle_ar: "", seoDesc_en: "", seoDesc_ar: "", publishAt: "" };
      const art0 = await A.content.saveArticleAction({}, fd(a));
      expect(art0.fieldErrors?.body_en).toMatch(/both English and Arabic/);
      const future = new Date(Date.now() + 86400_000 + 4 * 3600_000).toISOString().slice(0, 16);
      expect(await redirects(A.content.saveArticleAction({}, fd({ ...a, body_ar: "نص", publishAt: future })))).toBe("/admin/articles?saved=1");
      const art = (await M.Article.findOne({ slug: "hello" }).lean())!;
      expect(art.publishAt!.getTime()).toBeGreaterThan(Date.now()); // scheduled
      const svc = await import("@/features/content/service");
      expect(await svc.getArticle("hello")).toBeNull(); // not live yet
      await M.Article.updateOne({ slug: "hello" }, { publishAt: new Date(Date.now() - 1000) });
      expect((await svc.getArticle("hello"))?.title.en).toBe("Hello");
      expect((await A.content.saveArticleAction({}, fd({ ...a, body_ar: "نص" }))).fieldErrors?.slug).toMatch(/already/);
      expect(await A.content.savePageAction({}, fd({ slug: "hacker", title_en: "x", title_ar: "x" }))).toMatchObject({ fieldErrors: expect.any(Object) });
      expect(await A.content.savePageAction({}, fd({ slug: "about", title_en: "About", title_ar: "من", body_en: "t", body_ar: "ن", published: "on" }))).toMatchObject({ ok: true });
      expect((await svc.getPage("about"))?.title.ar).toBe("من");
      expect(await svc.getPage("unknown")).toBeNull();
      await M.Page.updateOne({ slug: "about" }, { published: false });
      expect(await svc.getPage("about")).toBeNull();
    });
    it("homepage banners: validates links, respects active state and campaign windows", async () => {
      await as("content_editor");
      const banner = (o: Record<string, unknown> = {}) => ({ id: "b1", active: true, order: 0, eyebrow: { en: "", ar: "" }, title: { en: "Sale", ar: "تخفيضات" }, subtitle: { en: "", ar: "" }, ctaLabel: { en: "Go", ar: "اذهب" }, ctaHref: "/deals", hue: 160, startsAt: "", endsAt: "", ...o });
      expect((await A.content.saveHomepageAction({}, fd({ banners: JSON.stringify([banner({ ctaHref: "javascript:alert(1)" })]) }))).fieldErrors?.banners).toBeTruthy();
      expect((await A.content.saveHomepageAction({}, fd({ banners: JSON.stringify([banner({ ctaHref: "//evil.com" })]) }))).fieldErrors?.banners).toBeTruthy();
      const past = new Date(Date.now() - 2 * 86400_000 + 4 * 3600_000).toISOString().slice(0, 16);
      const pastEnd = new Date(Date.now() - 86400_000 + 4 * 3600_000).toISOString().slice(0, 16);
      expect(await A.content.saveHomepageAction({}, fd({ banners: JSON.stringify([banner(), banner({ id: "b2", endsAt: pastEnd, startsAt: past }), banner({ id: "b3", active: false })]), s_deals: "on" }))).toMatchObject({ ok: true });
      const { getHomeConfig } = await import("@/features/content/service");
      const cfg = await getHomeConfig();
      expect(cfg.slides.map((s) => s.id)).toEqual(["b1"]); // expired + inactive banners are not shown
      expect(cfg.sections).toMatchObject({ deals: true, featured: false });
    });
  });

  describe("reviews", () => {
    async function deliveredOrder(userId: string, productId: string) {
      await M.Order.create({ orderNumber: `UAE-${Math.random().toString(36).slice(2, 10).toUpperCase()}`, user: userId, email: "c@t.test", idempotencyKey: `k${Math.random()}`.padEnd(20, "x"), status: "delivered", items: [{ productId, sku: "R-1", name: L("R"), qty: 1, unitPrice: 10, listPrice: 10, lineTotal: 10 }], address: {}, delivery: {}, totals: { total: 10 }, payment: { method: "cod", status: "cod_collected" }, timeline: [] });
    }
    it("only verified purchasers can review, once, and reviews stay hidden until approved; ratings come from approved reviews only", async () => {
      const p = await M.Product.create({ slug: "r", sku: "R-1", name: L("R"), category: cat, price: 10, stock: 5, status: "published" });
      const submit = (o: Record<string, string> = {}) => A.reviews.submitReviewAction({}, fd({ productId: String(p._id), rating: "5", title: "Great", body: "Really good product, works well.", ...o }));
      guest(); expect(await submit()).toMatchObject({ error: "auth" });
      const c = await as("customer");
      expect(await submit()).toMatchObject({ error: "review_not_eligible" }); // hasn't received it
      await deliveredOrder(c.id, String(p._id));
      expect((await submit({ rating: "9" })).fieldErrors?.rating).toBe("rating_invalid");
      expect((await submit({ body: "short" })).fieldErrors?.body).toBe("review_short");
      expect(await submit()).toMatchObject({ ok: true });
      expect(await submit()).toMatchObject({ error: "review_duplicate" });
      const r = (await M.Review.findOne({ product: p._id }).lean())!;
      expect(r).toMatchObject({ status: "pending", verified: true, authorName: "customer user".replace("customer user", "customer user") && expect.any(String) });
      expect((await M.Product.findById(p._id))!.ratingCount).toBe(0); // pending reviews don't count
      expect((await A.reviewSvc.getReviews(String(p._id), "helpful", 1)).total).toBe(0);
      await as("operations_manager");
      await A.reviewsAdmin.moderateReviewAction(fd({ id: String(r._id), to: "approved" }));
      expect(await M.Product.findById(p._id)).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
      expect((await A.reviewSvc.getReviews(String(p._id), "helpful", 1)).items).toHaveLength(1);
      await A.reviewsAdmin.moderateReviewAction(fd({ id: String(r._id), to: "hidden" }));
      expect(await M.Product.findById(p._id)).toMatchObject({ ratingAvg: 0, ratingCount: 0 });
      await as("customer"); // customers can't moderate
      await A.reviewsAdmin.moderateReviewAction(fd({ id: String(r._id), to: "approved" }));
      expect((await M.Review.findById(r._id))!.status).toBe("hidden");
    });
    it("helpful votes toggle once per user (not on own review); 3 reports send a review back to moderation", async () => {
      const p = await M.Product.create({ slug: "r2", sku: "R-2", name: L("R"), category: cat, price: 10, stock: 5, status: "published" });
      const author = await M.User.create({ email: "au@t.test", name: "Au Thor", passwordHash: "x" });
      const r = await M.Review.create({ product: p._id, user: author._id, rating: 4, body: "A fine product indeed.", authorName: "Au T.", status: "approved" });
      await as("customer");
      expect(await A.reviews.toggleHelpfulAction(String(r._id))).toMatchObject({ ok: true, count: 1, helped: true });
      expect(await A.reviews.toggleHelpfulAction(String(r._id))).toMatchObject({ ok: true, count: 0, helped: false });
      session = { id: String(author._id), email: author.email, name: author.name, role: "customer", locale: "en" };
      expect(await A.reviews.toggleHelpfulAction(String(r._id))).toMatchObject({ ok: false, error: "invalid" });
      for (let i = 0; i < 3; i++) { await as("customer"); await A.reviews.reportReviewAction(String(r._id), "spam"); await A.reviews.reportReviewAction(String(r._id), "spam"); }
      expect(await M.Review.findById(r._id)).toMatchObject({ status: "pending", flagCount: 3 }); // duplicate reports from one user don't count twice
    });
  });

  describe("scheduled sales", () => {
    it("refreshSalePrices starts and ends sales on time", async () => {
      const now = Date.now();
      await M.Product.create([
        { slug: "s1", sku: "S-1", name: L("S"), category: cat, price: 100, salePrice: 70, saleStartsAt: new Date(now - 1000), saleEndsAt: new Date(now + 86400_000), stock: 1, status: "published" },
        { slug: "s2", sku: "S-2", name: L("S"), category: cat, price: 100, salePrice: 70, saleStartsAt: new Date(now + 86400_000), stock: 1, status: "published" },
      ]);
      await M.Product.updateOne({ sku: "S-1" }, { finalPrice: 100 }); await M.Product.updateOne({ sku: "S-2" }, { finalPrice: 70 }); // simulate stale values
      expect(await A.maint.refreshSalePrices()).toMatchObject({ updated: 2 });
      expect((await M.Product.findOne({ sku: "S-1" }))!.finalPrice).toBe(70);
      expect((await M.Product.findOne({ sku: "S-2" }))!.finalPrice).toBe(100);
      expect(await A.maint.refreshSalePrices()).toMatchObject({ updated: 0 });
    });
  });
});
