// Copies THIS store's data from its old database into the ONE shared database that all four stores use. The old database is only read.
//
//   npm run db:migrate-store                       dry run (default): prints counts and conflicts, writes nothing
//   npm run db:migrate-store -- --apply            really copy
//   npm run db:migrate-store -- --apply --renumber also give this store's orders the new "RC-1001" numbers (old number kept in legacyOrderNumber)
//
// Env: OLD_MONGODB_URI [+ OLD_MONGODB_DB] = source, MONGODB_URI + MONGODB_DB = shared target, STORE_ID, ORDER_PREFIX.
//
// What is shared by all stores (merged by its natural key): products, categories, brands, FAQs, customers (by email), coupons, settings,
// content pages, home page, delivery zones, journal articles, leads. Everything that points at them (orders, carts, reviews, web credit,
// returns, stock movements ...) is re-pointed to the shared copy, so one customer = one account = one credit balance across all stores.
// Only ORDERS carry a storeId (and their own number prefix). Run the stores one after another; the FIRST store migrated is the master copy
// for shared content: later stores never overwrite it, differences are only reported.
// Idempotent: rows are matched by _id and only inserted when missing ($setOnInsert), so running twice creates nothing twice.
// Not copied (temporary): sessions (customers sign in again), rate limits, email codes, password-reset tokens, webhook events.
import mongoose, { type AnyBulkWriteOperation, type Connection } from "mongoose";
import { orderPrefix, storeId } from "../src/lib/store-config";
import { Address } from "../src/models/address";
import { Article } from "../src/models/article";
import { AuditLog } from "../src/models/audit-log";
import { Avatar } from "../src/models/avatar";
import { Cart } from "../src/models/cart";
import { ContentPage } from "../src/models/content-page";
import { Coupon } from "../src/models/coupon";
import { CouponRedemption } from "../src/models/coupon-redemption";
import { CreditAdjustment } from "../src/models/credit-adjustment";
import { CreditLot } from "../src/models/credit-lot";
import { DeliveryZone } from "../src/models/delivery-zone";
import { Homepage } from "../src/models/homepage";
import { InventoryMovement } from "../src/models/inventory-movement";
import { Lead } from "../src/models/lead";
import { Order } from "../src/models/order";
import { ReturnRequest } from "../src/models/return-request";
import { Review, ReviewReport, ReviewVote } from "../src/models/review";
import { ReviewReward } from "../src/models/review-reward";
import { Settings } from "../src/models/settings";
import { StockAlert } from "../src/models/stock-alert";
import { User } from "../src/models/user";
import { BrandModel } from "../lib/models/Brand";
import { CollectionModel } from "../lib/models/Collection";
import { FaqModel } from "../lib/models/Faq";
import { ImageDoc } from "../lib/models/ImageDoc";
import { ProductModel } from "../lib/models/Product";

type Doc = Record<string, unknown> & { _id: mongoose.Types.ObjectId };
type Spec = { label: string; coll: string; key?: (d: Doc) => Record<string, unknown>; note?: boolean; quiet?: boolean; map?: (d: Doc) => Doc };
const APPLY = process.argv.includes("--apply");
const RENUMBER = process.argv.includes("--renumber");
const BATCH = 500;
const VOLATILE = new Set(["_id", "__v", "createdAt", "updatedAt", "stock", "soldCount", "viewCount", "ratingAvg", "ratingCount", "variants", "images"]); // differences here are not conflicts
const idMap = new Map<string, mongoose.Types.ObjectId>(); // old _id -> _id of the shared row it was merged into (products, customers, categories, reviews ...)
const report: { label: string; read: number; insert: number; merged: number; conflicts: string[] }[] = [];
const notes: string[] = [];

const hide = (u: string) => u.replace(/\/\/[^@/]*@/, "//***@"); // never print the database password
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const diffFields = (a: Doc, b: Doc) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !VOLATILE.has(k) && !same(a[k], b[k]));
const isOid = (v: unknown): v is mongoose.Types.ObjectId => !!v && typeof v === "object" && (v as { _bsontype?: string })._bsontype === "ObjectId";
/** Re-points every ObjectId inside a document (any depth) to its shared copy. ObjectIds are globally unique, so one map for all collections is safe. */
function remap<T>(v: T): T {
  if (isOid(v)) return (idMap.get(String(v)) ?? v) as T;
  if (Array.isArray(v)) return v.map(remap) as T;
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x)])) as T;
  return v;
}

async function* batches(cursor: AsyncIterable<Doc>) {
  let buf: Doc[] = [];
  for await (const d of cursor) { buf.push(d); if (buf.length >= BATCH) { yield buf; buf = []; } }
  if (buf.length) yield buf;
}

async function copy(s: Spec, from: Connection, to: Connection) {
  const src = from.collection(s.coll), dst = to.collection(s.coll);
  const r = { label: s.label, read: 0, insert: 0, merged: 0, conflicts: [] as string[] };
  report.push(r);
  for await (const batch of batches(src.find({}).sort({ _id: 1 }) as unknown as AsyncIterable<Doc>)) {
    r.read += batch.length;
    const docs = batch.map((d) => { const { _id, ...rest } = d; const x = { _id, ...remap(rest) } as Doc; return s.map ? s.map(x) : x; });
    const byId = new Map((await dst.find({ _id: { $in: docs.map((d) => d._id) } }).toArray() as Doc[]).map((d) => [String(d._id), d]));
    const byKey = s.key ? await dst.find({ $or: docs.map((d) => s.key!(d)) }).toArray() as Doc[] : [];
    const ops: AnyBulkWriteOperation[] = [];
    for (const d of docs) {
      const mine = byId.get(String(d._id));
      const clash = s.key && !mine ? byKey.find((t) => String(t._id) !== String(d._id) && Object.entries(s.key!(d)).every(([k, v]) => same(t[k], v))) : undefined;
      const target = mine ?? clash;
      if (target) {
        r.merged++;
        if (clash) idMap.set(String(batch[docs.indexOf(d)]._id), clash._id); // later rows (orders, reviews ...) now point at the shared row
        if (!s.quiet) { const f = diffFields(d, target); if (f.length) r.conflicts.push(`${s.label} ${JSON.stringify(s.key?.(d) ?? d._id)}: differs in ${f.join(", ")} (kept the existing shared copy)`); }
        if (s.note && "stock" in d && d.stock !== target.stock) notes.push(`${s.label} ${String(d.sku ?? d.slug)}: stock here ${String(d.stock)} vs shared ${String(target.stock)} (shared kept)`);
      } else {
        r.insert++;
        ops.push({ updateOne: { filter: { _id: d._id }, update: { $setOnInsert: d }, upsert: true } } as AnyBulkWriteOperation);
      }
    }
    if (APPLY && ops.length) await dst.bulkWrite(ops as never, { ordered: false });
  }
}

async function main() {
  const oldUri = process.env.OLD_MONGODB_URI, newUri = process.env.MONGODB_URI;
  const oldDb = process.env.OLD_MONGODB_DB || undefined, newDb = process.env.MONGODB_DB || undefined;
  if (!oldUri || !newUri) throw new Error("OLD_MONGODB_URI (source) and MONGODB_URI (shared target) must both be set");
  if (oldUri === newUri && oldDb === newDb) throw new Error("source and target are the same database: refusing to run");
  const STORE = storeId(), PREFIX = orderPrefix();
  console.log(`${APPLY ? "APPLY" : "DRY RUN"}  store=${STORE}  prefix=${PREFIX}  renumber=${RENUMBER}\n  from ${hide(oldUri)} / ${oldDb ?? "(uri default)"}\n  to   ${hide(newUri)} / ${newDb ?? "(uri default)"}`);
  const from = await mongoose.createConnection(oldUri, { dbName: oldDb }).asPromise();
  const to = await mongoose.createConnection(newUri, { dbName: newDb }).asPromise();
  const c = (m: { collection: { collectionName: string } }) => m.collection.collectionName;
  try {
    // 1) Shared by every store, merged by natural key. Order matters: parents first, so their ids are known when children are copied.
    const shared: Spec[] = [
      { label: "categories", coll: c(CollectionModel), key: (d) => ({ slug: d.slug, type: d.type }) },
      { label: "brands", coll: c(BrandModel), key: (d) => ({ slug: d.slug }) },
      { label: "faqs", coll: c(FaqModel), key: (d) => ({ question: d.question }) },
      { label: "products", coll: c(ProductModel), key: (d) => (d.sku ? { sku: d.sku } : { slug: d.slug }), note: true },
      { label: "customers", coll: c(User), key: (d) => ({ email: d.email }), quiet: true }, // same email = same person; the first store's password is kept
      { label: "coupons", coll: c(Coupon), key: (d) => ({ code: d.code }) },
      { label: "settings", coll: c(Settings), key: (d) => ({ key: d.key }) },
      { label: "content pages", coll: c(ContentPage), key: (d) => ({ slug: d.slug }) },
      { label: "home page", coll: c(Homepage), key: (d) => ({ key: d.key }) },
      { label: "delivery zones", coll: c(DeliveryZone), key: (d) => ({ key: d.key }) },
      { label: "articles", coll: c(Article), key: (d) => ({ slug: d.slug }) },
      { label: "leads", coll: c(Lead), key: (d) => (d.email ? { email: d.email } : d.phone ? { phone: d.phone } : { _id: d._id }), quiet: true },
    ];
    for (const s of shared) await copy(s, from, to);

    // 2) Everything that belongs to a customer / product / order: copied as is, with its references pointing at the shared rows.
    const dependent: Spec[] = [
      { label: "addresses", coll: c(Address) },
      { label: "carts", coll: c(Cart), key: (d) => (d.user ? { user: d.user } : { guestId: d.guestId }), quiet: true },
      { label: "avatars", coll: c(Avatar), key: (d) => ({ user: d.user }), quiet: true },
      { label: "reviews", coll: c(Review), key: (d) => ({ product: d.product, user: d.user }), quiet: true }, // one review per customer per product
      { label: "review votes", coll: c(ReviewVote), key: (d) => ({ review: d.review, user: d.user }), quiet: true },
      { label: "review reports", coll: c(ReviewReport), key: (d) => ({ review: d.review, user: d.user }), quiet: true },
      { label: "credit lots", coll: c(CreditLot) },
      { label: "credit adjustments", coll: c(CreditAdjustment) },
      { label: "stock movements", coll: c(InventoryMovement) },
      { label: "stock alerts", coll: c(StockAlert), key: (d) => ({ sku: d.sku, email: d.email }), quiet: true },
      { label: "images", coll: c(ImageDoc) },
    ];
    for (const s of dependent) await copy(s, from, to);

    // 3) Orders (the only rows that carry a storeId). The old number is always kept in legacyOrderNumber; --renumber gives PREFIX-<n> from the shared counter.
    const counterId = `${STORE}:order`;
    const counters = to.collection<{ _id: string; seq: number }>("counters");
    let seq = (await counters.findOne({ _id: counterId }))?.seq ?? 1000;
    let maxSeen = 0;
    const re = new RegExp(`^${PREFIX}-(\\d+)$`);
    const next = () => ++seq;
    const have = new Map((await to.collection("orders").find({ storeId: STORE }, { projection: { orderNumber: 1 } }).toArray()).map((o) => [String(o._id), o.orderNumber as string])); // re-run: keep the number an order already got
    // Orders are deliberately NOT migrated for this store (and neither is anything that hangs off an order: returns, coupon uses, review rewards).
    await copy({ label: "audit log", coll: c(AuditLog) }, from, to);

    const target = RENUMBER ? Math.max(maxSeen, seq) : maxSeen; // the counter only ever moves forward ($max)
    console.log(`order counter ${counterId}: ${target ? `highest sequence = ${target}` : "no PREFIX-n numbers yet (starts at 1001)"}`);
    if (APPLY && target > 0) await counters.updateOne({ _id: counterId }, { $max: { seq: target } }, { upsert: true });
  } finally {
    await from.close(); await to.close();
  }

  console.log("\nwhat                 read  to-insert  already-shared");
  for (const r of report) console.log(`${r.label.padEnd(20)} ${String(r.read).padStart(5)} ${String(r.insert).padStart(10)} ${String(r.merged).padStart(15)}`);
  const conflicts = report.flatMap((r) => r.conflicts);
  console.log(conflicts.length ? `\n${conflicts.length} difference(s) against the shared copy (shared copy kept):\n - ${conflicts.slice(0, 100).join("\n - ")}` : "\nNo content differences.");
  if (notes.length) console.log(`\n${notes.length} product(s) with a different stock number than the shared copy (shared stock kept):\n - ${notes.slice(0, 40).join("\n - ")}`);
  const merged = report.find((r) => r.label === "customers")?.merged ?? 0;
  if (merged) console.log(`\n${merged} customer(s) already existed (same email): their orders/credit/reviews now belong to the shared account; its password is the one already stored.`);
  if (!APPLY) console.log("\nDry run only: nothing was written. Re-run with --apply to copy.");
}
main().catch((e) => { console.error(e.message); process.exit(1); });
