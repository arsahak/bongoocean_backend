import mongoose, { Document, Schema } from "mongoose";

export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export interface IReviewAttachment {
  url: string;
  name: string;
  type: "image" | "pdf";
}

export interface IReview extends Document {
  order: mongoose.Types.ObjectId;
  product: mongoose.Types.ObjectId;
  customer: mongoose.Types.ObjectId;
  rating: number;
  comment: string;
  attachments: IReviewAttachment[];
  status: ReviewStatus;
  moderationNote?: string;
  moderatedBy?: mongoose.Types.ObjectId;
  moderatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const reviewAttachmentSchema = new Schema<IReviewAttachment>(
  {
    url: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["image", "pdf"], required: true },
  },
  { _id: false }
);

const reviewSchema = new Schema<IReview>(
  {
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    attachments: {
      type: [reviewAttachmentSchema],
      default: [],
      validate: {
        validator: (attachments: IReviewAttachment[]) => attachments.length <= 5,
        message: "A review can contain at most 5 attachments",
      },
    },
    status: {
      type: String,
      enum: REVIEW_STATUSES,
      default: "pending",
    },
    moderationNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    moderatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    moderatedAt: Date,
  },
  { timestamps: true }
);

// A purchased product can be reviewed only once for a particular order.
reviewSchema.index({ order: 1, product: 1 }, { unique: true });
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });
reviewSchema.index({ status: 1, createdAt: -1 });
reviewSchema.index({ customer: 1, createdAt: -1 });

export const Review = mongoose.model<IReview>("Review", reviewSchema);
