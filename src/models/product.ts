// Schema lives in lib/models/Product.ts (identical in uae-ecommerce, uae-ecomerce2 and maison-noor); typed here for this app.
import type { Model } from "mongoose";
import { ProductModel } from "../../lib/models/Product";

export type ProductDoc = {
  sku: string; name: string; slug: string; category: string; subcategory?: string; brand?: string; model?: string;
  shortDescription?: string; longDescription?: string; highlights: string[]; finish?: string; includedItems: string[];
  images: { url: string; alt?: string; publicId?: string }[]; priceFrom?: number; priceTo?: number; currency: string;
  variants: { sku: string; color?: string; size?: string; price?: number; stock: number; image?: string }[];
  stock: number; tags: string[]; isNewArrival?: boolean; isFeatured?: boolean; isMostWanted?: boolean;
  status: "active" | "draft" | "archived"; mergedInto?: string; slugHistory: string[]; lowStockThreshold: number;
  ratingAvg: number; ratingCount: number; viewCount: number; soldCount: number; seo?: { title?: string; description?: string };
  createdAt: Date; updatedAt: Date;
};
export const Product = ProductModel as unknown as Model<ProductDoc>;
