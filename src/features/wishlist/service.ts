import "server-only";
import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { Product } from "@/models/product";
import { User } from "@/models/user";
import type { ProductCardData } from "@/features/catalog/service";

export const WISHLIST_MAX = 200;

export async function getWishlistIds(userId: string): Promise<string[]> {
  await connectDb();
  const u = await User.findById(userId, { wishlist: 1 }).lean();
  return (u?.wishlist ?? []).map(String);
}

/** Toggle membership. Returns the new full list of ids, or null when the product doesn't exist / list is full. */
export async function toggleWishlist(userId: string, productId: string): Promise<{ ids: string[]; added: boolean } | { error: "not_found" | "full" }> {
  if (!Types.ObjectId.isValid(productId)) return { error: "not_found" };
  await connectDb();
  const ids = await getWishlistIds(userId);
  if (ids.includes(productId)) {
    await User.updateOne({ _id: userId }, { $pull: { wishlist: productId } });
    return { ids: ids.filter((i) => i !== productId), added: false };
  }
  if (ids.length >= WISHLIST_MAX) return { error: "full" };
  if (!(await Product.exists({ _id: productId, status: "published" }))) return { error: "not_found" };
  await User.updateOne({ _id: userId }, { $addToSet: { wishlist: productId } });
  return { ids: [...ids, productId], added: true };
}

export async function getWishlistProducts(userId: string): Promise<ProductCardData[]> {
  const ids = await getWishlistIds(userId);
  if (!ids.length) return [];
  const rows = (await Product.find({ _id: { $in: ids }, status: "published" }).lean()) as unknown as {
    _id: unknown; slug: string; sku: string; name: { en: string; ar: string }; price: number; finalPrice: number; icon: string; hue: number;
    ratingAvg: number; ratingCount: number; stock: number; images?: { url: string }[]; brand?: string;
  }[];
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows
    .map((p) => ({ id: String(p._id), slug: p.slug, sku: p.sku, name: p.name, price: p.price, finalPrice: p.finalPrice, icon: p.icon, hue: p.hue, ratingAvg: p.ratingAvg, ratingCount: p.ratingCount, stock: p.stock, image: p.images?.[0]?.url, brand: p.brand }))
    .sort((a, b) => (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0)); // newest saved first
}
