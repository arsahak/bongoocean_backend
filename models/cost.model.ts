import mongoose, { Document, Schema } from "mongoose";

export const COST_CATEGORIES = [
  "Domain & Hosting",
  "Software & Tools",
  "Marketing",
  "Office Expense",
  "Travel & Transport",
  "Utilities",
  "Salary & Contractor",
  "Other",
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export const COST_PAYMENT_METHODS = [
  "Company Card",
  "Bank Transfer",
  "Cheque",
  "Mobile Banking",
  "Cash",
  "Other",
] as const;
export type CostPaymentMethod = (typeof COST_PAYMENT_METHODS)[number];

export const COST_PAYERS = ["Sahak", "Ruyel"] as const;
export type CostPayer = (typeof COST_PAYERS)[number];

export interface ICostAttachment {
  url: string;
  name: string;
  type: "image" | "video";
  size: number;
  // DigitalOcean Spaces object key, kept only to delete the file on
  // replace/removal.
  key: string;
}

export interface ICost extends Document {
  title: string;
  category: CostCategory;
  customCategory?: string;
  reason: string;
  amount: number;
  expenseDate: Date;
  paymentMethod: CostPaymentMethod;
  paidBy: CostPayer;
  reference?: string;
  comment?: string;
  attachment?: ICostAttachment;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const costAttachmentSchema = new Schema<ICostAttachment>(
  {
    url: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["image", "video"], required: true },
    size: { type: Number, required: true, min: 0 },
    key: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const costSchema = new Schema<ICost>(
  {
    title: {
      type: String,
      required: [true, "Cost title is required"],
      trim: true,
      maxlength: [120, "Cost title cannot exceed 120 characters"],
    },
    category: {
      type: String,
      enum: COST_CATEGORIES,
      required: [true, "Category is required"],
    },
    customCategory: {
      type: String,
      trim: true,
      maxlength: [80, "Custom category cannot exceed 80 characters"],
      default: "",
    },
    reason: {
      type: String,
      required: [true, "Reason is required"],
      trim: true,
      maxlength: [1000, "Reason cannot exceed 1000 characters"],
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [1, "Amount must be at least ৳1"],
    },
    expenseDate: {
      type: Date,
      required: [true, "Expense date is required"],
    },
    paymentMethod: {
      type: String,
      enum: COST_PAYMENT_METHODS,
      required: [true, "Payment method is required"],
    },
    paidBy: {
      type: String,
      enum: COST_PAYERS,
      required: [true, "Paid by is required"],
    },
    reference: {
      type: String,
      trim: true,
      maxlength: [120, "Reference cannot exceed 120 characters"],
      default: "",
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [500, "Comment cannot exceed 500 characters"],
      default: "",
    },
    attachment: {
      type: costAttachmentSchema,
      default: undefined,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

costSchema.pre("validate", function (next) {
  if (this.category === "Other" && !this.customCategory?.trim()) {
    this.invalidate(
      "customCategory",
      "Custom category is required when category is Other",
    );
  }
  if (this.category !== "Other") this.customCategory = "";
  next();
});

costSchema.index({ expenseDate: -1, createdAt: -1 });
costSchema.index({ category: 1, expenseDate: -1 });
costSchema.index({ paidBy: 1, expenseDate: -1 });

export const Cost = mongoose.model<ICost>("Cost", costSchema);
