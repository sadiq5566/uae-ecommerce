import { Schema, model, models, type InferSchemaType, type Model, type Types } from "mongoose";

export const REVIEW_STATUSES = ["pending", "approved", "rejected", "hidden"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

const reviewSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    order: { type: Schema.Types.ObjectId, ref: "Order" }, // the delivered order that makes this a verified purchase
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 100 },
    body: { type: String, required: true, trim: true, minlength: 10, maxlength: 2000 },
    authorName: { type: String, required: true, trim: true, maxlength: 60 }, // first name + initial, never the email
    verified: { type: Boolean, default: false },
    status: { type: String, enum: REVIEW_STATUSES, default: "pending" },
    helpfulCount: { type: Number, default: 0, min: 0 },
    flagCount: { type: Number, default: 0, min: 0 },
    moderatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    moderatedAt: Date,
    demo: { type: Boolean, default: false }, // seeded sample (development only)
  },
  { timestamps: true },
);
reviewSchema.index({ product: 1, user: 1 }, { unique: true }); // one review per customer per product
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });
reviewSchema.index({ status: 1, flagCount: -1, createdAt: -1 });

export type ReviewDoc = InferSchemaType<typeof reviewSchema>;
export const Review: Model<ReviewDoc> = (models.Review as Model<ReviewDoc>) ?? model("Review", reviewSchema);

const voteSchema = new Schema({ review: { type: Schema.Types.ObjectId, required: true }, user: { type: Schema.Types.ObjectId, required: true } }, { timestamps: { createdAt: true, updatedAt: false } });
voteSchema.index({ review: 1, user: 1 }, { unique: true });
type VoteDoc = { review: Types.ObjectId; user: Types.ObjectId };
export const ReviewVote = ((models.ReviewVote as unknown as Model<VoteDoc>) ?? model<VoteDoc>("ReviewVote", voteSchema)) as Model<VoteDoc>;

const reportSchema = new Schema({ review: { type: Schema.Types.ObjectId, required: true }, user: { type: Schema.Types.ObjectId, required: true }, reason: { type: String, enum: ["spam", "offensive", "irrelevant", "other"], default: "other" } }, { timestamps: { createdAt: true, updatedAt: false } });
reportSchema.index({ review: 1, user: 1 }, { unique: true });
type ReportDoc = { review: Types.ObjectId; user: Types.ObjectId; reason: string };
export const ReviewReport = ((models.ReviewReport as unknown as Model<ReportDoc>) ?? model<ReportDoc>("ReviewReport", reportSchema)) as Model<ReportDoc>;
