"use server";
import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { actor } from "@/lib/admin/guard";
import { audit } from "@/lib/admin/audit";
import { connectDb } from "@/lib/db";
import { recalcRating } from "@/features/reviews/service";
import { Review, REVIEW_STATUSES, type ReviewStatus } from "@/models/review";

/** Approve / reject / hide a review. Ratings on the product are recalculated from approved reviews. */
export async function moderateReviewAction(fd: FormData) {
  const user = await actor("reviews:moderate");
  const id = String(fd.get("id") ?? ""); const to = String(fd.get("to")) as ReviewStatus;
  if (!user || !Types.ObjectId.isValid(id) || !REVIEW_STATUSES.includes(to)) return;
  await connectDb();
  const r = await Review.findByIdAndUpdate(id, { status: to, moderatedBy: user.id, moderatedAt: new Date(), ...(to === "approved" ? { flagCount: 0 } : {}) }, { returnDocument: "after" });
  if (!r) return;
  await recalcRating(r.product);
  await audit(user, `review.${to}`, "review", id, `Review set to ${to}`);
  revalidatePath("/admin/reviews"); revalidatePath("/[lang]/p/[slug]", "page"); revalidatePath("/[lang]", "layout");
}
