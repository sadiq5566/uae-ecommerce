import { Schema, model, models, type Model } from "mongoose";
import { orderPrefix, storeId } from "@/lib/store-config";

// Atomic per-store counters. NOT store-scoped by the plugin: the store id is part of the _id ("oasishomemarket:order").
const counterSchema = new Schema({ _id: { type: String, required: true }, seq: { type: Number, required: true } }, { versionKey: false });
export const Counter: Model<{ _id: string; seq: number }> = (models.Counter as Model<{ _id: string; seq: number }>) ?? model("Counter", counterSchema);

export const ORDER_SEQ_START = 1000; // first order of a new store is 1001

/** Next number for this store, e.g. "OH-1001". One atomic findOneAndUpdate (aggregation-pipeline update): no countDocuments, no "last + 1". */
export async function nextOrderNumber(): Promise<string> {
  const _id = `${storeId()}:order`;
  const bump = () => Counter.findOneAndUpdate({ _id }, [{ $set: { seq: { $add: [{ $ifNull: ["$seq", ORDER_SEQ_START] }, 1] } } }], { upsert: true, returnDocument: "after", updatePipeline: true }).lean();
  let doc;
  try { doc = await bump(); }
  catch (e) { if ((e as { code?: number }).code !== 11000) throw e; doc = await bump(); } // two first-ever orders raced to create the counter: the loser just increments
  return `${orderPrefix()}-${doc!.seq}`;
}
