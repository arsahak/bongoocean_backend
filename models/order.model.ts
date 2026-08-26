import mongoose, { Schema, Document, Model } from "mongoose";
import { BD_DIVISIONS, DELIVERY_ZONES, PHONE_REGEX, type IAddress } from "./user.model";

export const ORDER_STATUSES = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["cod", "bkash", "nagad", "card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface IOrderItem {
  product: mongoose.Types.ObjectId;
  title: string;
  image: string;
  sku: string;
  price: number;
  quantity: number;
}

export interface IOrder extends Document {
  orderNumber: string;
  customer?: mongoose.Types.ObjectId;
  customerName: string;
  customerCompany?: string;
  customerPhone: string;
  customerEmail?: string;
  shippingAddress?: IAddress;
  items: IOrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    title: { type: String, required: true, trim: true },
    image: { type: String, default: "" },
    sku: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const shippingAddressSchema = new Schema<IAddress>(
  {
    division: { type: String, enum: BD_DIVISIONS },
    district: { type: String, trim: true, default: "" },
    upazila: { type: String, trim: true, default: "" },
    postOffice: { type: String, trim: true, default: "" },
    postCode: { type: String, trim: true, default: "" },
    area: { type: String, trim: true, default: "" },
    zone: { type: String, enum: DELIVERY_ZONES },
  },
  { _id: false }
);

const ORDER_PREFIX = "FMA-ORD-";

/**
 * @swagger
 * components:
 *   schemas:
 *     OrderItem:
 *       type: object
 *       properties:
 *         product:
 *           type: string
 *           description: Product id
 *         title:
 *           type: string
 *         image:
 *           type: string
 *         sku:
 *           type: string
 *         price:
 *           type: number
 *           description: Unit price in BDT at the time of order
 *         quantity:
 *           type: integer
 *     Order:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         orderNumber:
 *           type: string
 *           example: FMA-ORD-1
 *         customer:
 *           type: string
 *           nullable: true
 *           description: Registered customer id, if this order is tied to an account
 *         customerName:
 *           type: string
 *         customerCompany:
 *           type: string
 *         customerPhone:
 *           type: string
 *         customerEmail:
 *           type: string
 *         shippingAddress:
 *           $ref: '#/components/schemas/Address'
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/OrderItem'
 *         subtotal:
 *           type: number
 *         deliveryFee:
 *           type: number
 *         discount:
 *           type: number
 *         total:
 *           type: number
 *         paymentMethod:
 *           type: string
 *           enum: [cod, bkash, nagad, card]
 *         paymentStatus:
 *           type: string
 *           enum: [pending, paid, failed, refunded]
 *         orderStatus:
 *           type: string
 *           enum: [pending, processing, shipped, delivered, cancelled]
 *         notes:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     OrderItemInput:
 *       type: object
 *       required:
 *         - product
 *         - quantity
 *       properties:
 *         product:
 *           type: string
 *         quantity:
 *           type: integer
 *     OrderInput:
 *       type: object
 *       required:
 *         - customerName
 *         - customerPhone
 *         - items
 *         - paymentMethod
 *       properties:
 *         customerName:
 *           type: string
 *         customerCompany:
 *           type: string
 *         customerPhone:
 *           type: string
 *         customerEmail:
 *           type: string
 *         shippingAddress:
 *           $ref: '#/components/schemas/Address'
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/OrderItemInput'
 *         deliveryFee:
 *           type: number
 *         discount:
 *           type: number
 *         paymentMethod:
 *           type: string
 *           enum: [cod, bkash, nagad, card]
 *         notes:
 *           type: string
 */
const orderSchema = new Schema<IOrder>(
  {
    orderNumber: {
      type: String,
      unique: true,
      trim: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    customerName: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
    },
    customerCompany: {
      type: String,
      trim: true,
      default: "",
    },
    customerPhone: {
      type: String,
      required: [true, "Customer phone is required"],
      trim: true,
      match: [PHONE_REGEX, "Please enter a valid phone number"],
    },
    customerEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    shippingAddress: {
      type: shippingAddressSchema,
      default: () => ({}),
    },
    items: {
      type: [orderItemSchema],
      validate: {
        validator: (items: IOrderItem[]) => items.length > 0,
        message: "An order must have at least one item",
      },
    },
    subtotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      required: [true, "Payment method is required"],
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "pending",
    },
    orderStatus: {
      type: String,
      enum: ORDER_STATUSES,
      default: "pending",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

// Customer history queries filter by owner and sort newest-first.
orderSchema.index({ customer: 1, createdAt: -1 });

orderSchema.pre("validate", async function (next) {
  this.subtotal = this.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  this.total = Math.max(0, this.subtotal + this.deliveryFee - this.discount);

  if (!this.orderNumber) {
    const pattern = new RegExp(`^${ORDER_PREFIX}(\\d+)$`, "i");
    const OrderModel = this.constructor as Model<IOrder>;
    const orders = await OrderModel.find(
      { orderNumber: { $regex: pattern } },
      { orderNumber: 1 }
    ).lean();

    const maxNumber = orders.reduce((max, o) => {
      const match = o.orderNumber.match(pattern);
      const num = match ? parseInt(match[1], 10) : 0;
      return Math.max(max, num);
    }, 0);

    this.orderNumber = `${ORDER_PREFIX}${maxNumber + 1}`;
  }

  next();
});

export const Order = mongoose.model<IOrder>("Order", orderSchema);
