// Categories are Collection docs with type "category"; schema lives in lib/models/Collection.ts (identical across all three projects).
import type { Model } from "mongoose";
import { CollectionModel } from "../../lib/models/Collection";

export type CategoryDoc = { slug: string; name: string; description?: string; image?: string; parent?: string; type: "category" | "style" | "finish" | "curated"; sortOrder: number };
export const Category = CollectionModel as unknown as Model<CategoryDoc>;
