"use server";
import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { connectDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { echo, type FormState } from "@/features/auth/schemas";
import { Review, ReviewReport, ReviewVote } from "@/models/review";
import { Product } from "@/models/product";
import { cleanText, displayName, recalcRating, reviewEligibility } from "./service";

const schema = z.object({
  productId: z.string().regex(/^[a-f0-9]{24}$/),
  rating: z.coerce.number().int("rating_invalid").min(1, "rating_invalid").max(5, "rating_invalid"),
  title: z.string().trim().max(100, "too_long").optional(),
  body: z.string().transform(cleanText).pipe(z.string().min(10, "review_short").max(2000, "too_long")),
});

export async function submitReviewAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "auth" };
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) { const fe: Record<string, string> = {}; for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message; return { fieldErrors: fe, values: echo(fd) }; }
  if (!(await rateLimit(`review:${user.id}`, 5, 3600)).ok) return { error: "rate_limited", values: echo(fd) };
  const { productId, rating, title, body } = parsed.data;
  await connectDb();
  const product = await Product.findOne({ _id: productId, status: "active", mergedInto: null }).select("slug").lean();
  if (!product) return { error: "not_found" };
  const elig = await reviewEligibility(user.id, productId); // eligibility is decided on the server, never by the form
  if (elig.state === "already") return { error: "review_duplicate" };
  if (elig.state === "unverified") return { error: "verify_required" };
  if (elig.state !== "can_review") return { error: "review_not_eligible" };
  try {
    await Review.create({ product: productId, user: user.id, order: elig.orderId, rating, title: title ? cleanText(title) : undefined, body, authorName: displayName(user.name), verified: !!elig.orderId, status: "pending" });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return { error: "review_duplicate" };
    throw e;
  }
  return { ok: true };
}

export async function toggleHelpfulAction(reviewId: unknown): Promise<{ ok: boolean; count?: number; helped?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "auth" };
  if (typeof reviewId !== "string" || !Types.ObjectId.isValid(reviewId)) return { ok: false, error: "not_found" };
  if (!(await rateLimit(`helpful:${user.id}`, 60, 600)).ok) return { ok: false, error: "rate_limited" };
  await connectDb();
  const r = await Review.findOne({ _id: reviewId, status: "approved" }).select("user").lean();
  if (!r) return { ok: false, error: "not_found" };
  if (String(r.user) === user.id) return { ok: false, error: "invalid" }; // can't vote on your own review
  const existing = await ReviewVote.findOneAndDelete({ review: reviewId, user: user.id });
  let helped: boolean;
  if (existing) { await Review.updateOne({ _id: reviewId, helpfulCount: { $gt: 0 } }, { $inc: { helpfulCount: -1 } }); helped = false; }
  else {
    try { await ReviewVote.create({ review: reviewId, user: user.id }); await Review.updateOne({ _id: reviewId }, { $inc: { helpfulCount: 1 } }); helped = true; }
    catch { helped = true; } // concurrent duplicate vote
  }
  const fresh = await Review.findById(reviewId).select("helpfulCount").lean();
  return { ok: true, count: fresh?.helpfulCount ?? 0, helped };
}

/** Customers can flag a review. Three distinct reports send an approved review back to the moderation queue automatically. */
export async function reportReviewAction(reviewId: unknown, reason: unknown): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "auth" };
  if (typeof reviewId !== "string" || !Types.ObjectId.isValid(reviewId)) return { ok: false, error: "not_found" };
  if (!(await rateLimit(`report:${user.id}`, 20, 3600)).ok) return { ok: false, error: "rate_limited" };
  const why = (["spam", "offensive", "irrelevant", "other"] as const).find((r) => r === reason) ?? "other";
  await connectDb();
  const r = await Review.findOne({ _id: reviewId, status: "approved" }).select("product").lean();
  if (!r) return { ok: false, error: "not_found" };
  try { await ReviewReport.create({ review: reviewId, user: user.id, reason: why }); } catch { return { ok: true }; } // already reported
  const updated = await Review.findOneAndUpdate({ _id: reviewId }, { $inc: { flagCount: 1 } }, { returnDocument: "after" }).lean();
  if (updated && updated.flagCount >= 3 && updated.status === "approved") { await Review.updateOne({ _id: reviewId }, { status: "pending" }); await recalcRating(r.product); revalidatePath("/[lang]/p/[slug]", "page"); }
  return { ok: true };
}
