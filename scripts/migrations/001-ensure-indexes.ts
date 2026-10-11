import type { Db } from "mongodb";
import { allModels } from "../models";

/** Baseline: make sure every index defined in the schemas exists. */
export async function up(_db: Db) {
  void _db;
  for (const m of allModels) await m.createIndexes();
}
