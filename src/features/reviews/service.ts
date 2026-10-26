import "server-only";
import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { Order } from "@/models/order";
import { Product } from "@/models/product";
import { User } from "@/models/user";
import { Review, ReviewVote } from "@/models/review";

/** Policy switch: only customers whose order containing the product was delivered may review it (verified purchase). */
export const REQUIRE_VERIFIED_PURCHASE = true;
export const REVIEW_SORTS = ["helpful", "newest", "highest", "lowest"] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];
const SORT = { helpful: { helpfulCount: -1, createdAt: -1 }, newest: { createdAt: -1 }, highest: { rating: -1, createdAt: -1 }, lowest: { rating: 1, createdAt: -1 } } as const;

export type ReviewView = { id: string; rating: number; title?: string; body: string; authorName: string; verified: boolean; helpfulCount: number; createdAt: string; helpedByMe: boolean };

/** Recompute the product's average rating and count from APPROVED reviews only (never from client input). */
export async function recalcRating(productId: string | Types.ObjectId) {
  await connectDb();
  const [agg] = await Review.aggregate([{ $match: { product: new Types.ObjectId(String(productId)), status: "approved" } }, { $group: { _id: null, avg: { $avg: "$rating" }, n: { $sum: 1 } } }]);
  await Product.updateOne({ _id: productId }, { ratingAvg: agg ? Math.round(agg.avg * 10) / 10 : 0, ratingCount: agg?.n ?? 0 });
}

export async function getReviews(productId: string, sort: ReviewSort, page: number, viewerId?: string, size = 8) {
  await connectDb();
  const match = { product: new Types.ObjectId(productId), status: "approved" as const };
  const [rows, dist] = await Promise.all([
    Review.find(match).sort(SORT[sort]).skip((page - 1) * size).limit(size).lean(),
    Review.aggregate([{ $match: match }, { $group: { _id: "$rating", n: { $sum: 1 } } }]),
  ]);
  const distribution = [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: (dist.find((d) => d._id === r)?.n as number) ?? 0 }));
  const total = distribution.reduce((a, d) => a + d.count, 0);
  const avg = total ? Math.round((distribution.reduce((a, d) => a + d.rating * d.count, 0) / total) * 10) / 10 : 0;
  const mine = viewerId && rows.length ? new Set((await ReviewVote.find({ user: viewerId, review: { $in: rows.map((r) => r._id) } }).lean()).map((v) => String(v.review))) : new Set<string>();
  const items: ReviewView[] = rows.map((r) => ({ id: String(r._id), rating: r.rating, title: r.title ?? undefined, body: r.body, authorName: r.authorName, verified: r.verified, helpfulCount: r.helpfulCount, createdAt: (r as unknown as { createdAt: Date }).createdAt.toISOString(), helpedByMe: mine.has(String(r._id)) }));
  return { items, distribution, total, avg, pages: Math.max(1, Math.ceil(total / size)) };
}

export type Eligibility = "guest" | "unverified" | "can_review" | "already" | "not_purchased";

export async function reviewEligibility(userId: string | undefined, productId: string): Promise<{ state: Eligibility; orderId?: string }> {
  if (!userId) return { state: "guest" };
  await connectDb();
  // Reviews need a verified email (staff are exempt), so they come from real inboxes.
  if (!(await User.exists({ _id: userId, $or: [{ emailVerifiedAt: { $exists: true } }, { role: { $ne: "customer" } }] }))) return { state: "unverified" };
  if (await Review.exists({ product: productId, user: userId })) return { state: "already" };
  const order = await Order.findOne({ user: userId, status: "delivered", "items.productId": productId }).select("_id").lean();
  if (order) return { state: "can_review", orderId: String(order._id) };
  return REQUIRE_VERIFIED_PURCHASE ? { state: "not_purchased" } : { state: "can_review" };
}

/** "Sara Ali" → "Sara A." — reviews never show full names or emails. */
export function displayName(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
}

/** Strip control characters and collapse excessive blank lines. Output is rendered as plain text (React escapes it). */
export const cleanText = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\n{3,}/g, "\n\n").trim();
