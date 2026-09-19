import mongoose, { Schema, Document } from "mongoose";

export const ACTIVITY_ACTIONS = ["create", "update", "delete"] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export const ACTIVITY_MODULES = [
  "product",
  "category",
  "brand",
  "supplier",
  "vendor",
  "stock",
  "order",
  "customer",
  "staff",
  "review",
  "costing",
] as const;
export type ActivityModuleName = (typeof ACTIVITY_MODULES)[number];

export interface IActivityLog extends Document {
  user: mongoose.Types.ObjectId;
  userName: string;
  userRole: string;
  action: ActivityAction;
  module: ActivityModuleName;
  resourceId?: mongoose.Types.ObjectId;
  resourceName?: string;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     ActivityLog:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 656f1c2e8f1b2c0012a34567
 *         user:
 *           type: string
 *           description: Id of the staff member who performed the action (populated with { firstName, lastName, email, role } on read endpoints)
 *         userName:
 *           type: string
 *           description: Snapshot of the actor's name at the time of the action
 *           example: Jane Admin
 *         userRole:
 *           type: string
 *           description: Snapshot of the actor's role at the time of the action
 *           example: admin
 *         action:
 *           type: string
 *           enum: [create, update, delete]
 *         module:
 *           type: string
 *           enum: [product, category, brand, supplier, vendor, stock, order, customer, staff, review, costing]
 *         resourceId:
 *           type: string
 *           nullable: true
 *         resourceName:
 *           type: string
 *           example: Aqua One
 *         description:
 *           type: string
 *           example: Created brand "Aqua One"
 *         metadata:
 *           type: object
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 */
const activityLogSchema = new Schema<IActivityLog>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userName: {
      type: String,
      required: true,
      trim: true,
    },
    userRole: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      enum: ACTIVITY_ACTIONS,
      required: true,
    },
    module: {
      type: String,
      enum: ACTIVITY_MODULES,
      required: true,
    },
    resourceId: {
      type: Schema.Types.ObjectId,
    },
    resourceName: {
      type: String,
      trim: true,
      default: "",
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ module: 1, createdAt: -1 });
activityLogSchema.index({ user: 1, createdAt: -1 });

export const ActivityLog = mongoose.model<IActivityLog>(
  "ActivityLog",
  activityLogSchema,
);
