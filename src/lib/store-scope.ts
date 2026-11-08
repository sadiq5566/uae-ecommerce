import type { Aggregate, Model, PipelineStage, Query, Schema } from "mongoose";
import { storeId, useSharedDb } from "@/lib/store-config";

/**
 * Mongoose plugin for the data that belongs to ONE store inside the shared database: ORDERS only. Products, customers, credit, reviews, content, settings, delivery and categories are deliberately shared by all stores.
 *  - every find / update / delete / count / distinct gets { storeId } added to its filter, and every aggregate starts with a $match on it,
 *    so a forgotten filter can never leak another store's rows;
 *  - every new document gets storeId = the current store (the value cannot be set by the caller, and cannot be changed afterwards);
 *  - the filtering is OFF while USE_SHARED_DB is off (old single-store database), but storeId is still written so data stays migratable.
 * Not covered, by design: raw driver calls (Model.collection.*) and Model.bulkWrite. Use allStores()/aggregateAllStores() to opt out explicitly.
 */
type Flagged = { _allStores?: boolean };
const QUERY_OPS = ["find", "findOne", "findOneAndUpdate", "findOneAndDelete", "findOneAndReplace", "updateOne", "updateMany", "replaceOne", "countDocuments", "distinct"] as const;
const FIRST_ONLY = ["$search", "$searchMeta", "$vectorSearch", "$geoNear", "$collStats", "$indexStats", "$listSessions"];

export function storeScope(schema: Schema) {
  schema.add({ storeId: { type: String, required: true, index: true, immutable: true, default: () => storeId() } });

  schema.pre("validate", function () { if (this.isNew) this.set("storeId", storeId()); }); // ignores a caller-supplied value

  schema.pre([...QUERY_OPS], function (this: Query<unknown, unknown> & Flagged) {
    if (!useSharedDb() || this._allStores) return;
    this.where({ storeId: storeId() });
  });
  schema.pre(["deleteOne", "deleteMany"], { query: true, document: false }, function (this: Query<unknown, unknown> & Flagged) {
    if (!useSharedDb() || this._allStores) return;
    this.where({ storeId: storeId() });
  });

  schema.pre("aggregate", function (this: Aggregate<unknown> & Flagged) {
    if (!useSharedDb() || this._allStores) return;
    const p = this.pipeline() as unknown as Record<string, unknown>[];
    const match = { $match: { storeId: storeId() } };
    const at = p.length && FIRST_ONLY.some((k) => k in p[0]) ? 1 : 0; // some stages must stay first
    if (JSON.stringify(p[at]) === JSON.stringify(match)) return; // already added (pipeline run twice)
    p.splice(at, 0, match);
  });
}

type Actor = { role?: string } | null | undefined;
function assertSuperAdmin(actor: Actor) {
  if (actor?.role !== "owner") throw new Error("allStores(): only the super-admin (owner) may read across stores");
}

/** Explicit, owner-only opt-out of store scoping for a query:  allStores(Order.find({...}), admin) */
export function allStores<Q extends Query<never, never>>(query: Q, actor: Actor): Q {
  assertSuperAdmin(actor);
  (query as unknown as Flagged)._allStores = true;
  return query;
}
/** Same for aggregations:  aggregateAllStores(Order, pipeline, admin) */
export function aggregateAllStores<T>(model: Model<T>, pipeline: PipelineStage[], actor: Actor) {
  assertSuperAdmin(actor);
  const a = model.aggregate(pipeline) as Aggregate<unknown[]> & Flagged;
  a._allStores = true;
  return a;
}
