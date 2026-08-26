import mongoose, { Schema, Document } from "mongoose";

export interface IStock extends Document {
  product: mongoose.Types.ObjectId;
  supplier: mongoose.Types.ObjectId;
  quantity: number;
  costPrice?: number;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Stock:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 656f1c2e8f1b2c0012a34567
 *         product:
 *           type: string
 *           description: Product id (populated with { title, sku, stock } on read endpoints)
 *         supplier:
 *           type: string
 *           description: Supplier id (populated with { name } on read endpoints)
 *         quantity:
 *           type: integer
 *           description: Units received from the supplier, added to the product's stock
 *           example: 50
 *         costPrice:
 *           type: number
 *           nullable: true
 *           description: Price paid per unit to the supplier, in BDT (৳)
 *           example: 120
 *         note:
 *           type: string
 *           example: Restock ahead of Eid promotion
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     StockInput:
 *       type: object
 *       required:
 *         - product
 *         - supplier
 *         - quantity
 *       properties:
 *         product:
 *           type: string
 *         supplier:
 *           type: string
 *         quantity:
 *           type: integer
 *         costPrice:
 *           type: number
 *         note:
 *           type: string
 */
const stockSchema = new Schema<IStock>(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product is required"],
    },
    supplier: {
      type: Schema.Types.ObjectId,
      ref: "Supplier",
      required: [true, "Supplier is required"],
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [1, "Quantity must be at least 1"],
    },
    costPrice: {
      type: Number,
      min: [0, "Cost price cannot be negative"],
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true },
);

export const Stock = mongoose.model<IStock>("Stock", stockSchema);
