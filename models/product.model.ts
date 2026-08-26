import mongoose, { Schema, Document, Model } from "mongoose";

export const PRODUCT_UNITS = ["kg", "g", "l", "ml", "pcs"] as const;

export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export interface IProduct extends Document {
  title: string;
  slug: string;
  sku: string;
  category: mongoose.Types.ObjectId;
  brand?: mongoose.Types.ObjectId | null;
  shortDescription: string;
  overview: string;
  featureImage: string;
  galleryImages: string[];
  price: number;
  discountPrice?: number;
  unit: ProductUnit;
  weight: number;
  stock: number;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");

/**
 * @swagger
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 656f1c2e8f1b2c0012a34567
 *         title:
 *           type: string
 *           example: API Stress Coat Water Conditioner 500ml
 *         slug:
 *           type: string
 *           example: api-stress-coat-water-conditioner-500ml
 *         sku:
 *           type: string
 *           example: FMA-WC-500ML
 *         category:
 *           type: string
 *           description: Category id (populated with { name, slug } on read endpoints)
 *         brand:
 *           type: string
 *           nullable: true
 *           description: Brand id (populated with { name, slug } on read endpoints)
 *         shortDescription:
 *           type: string
 *           example: Instantly removes chlorine and detoxifies heavy metals
 *         overview:
 *           type: string
 *           example: A full-length description of the product, its ingredients, and how to use it.
 *         featureImage:
 *           type: string
 *           example: https://example.com/products/stress-coat.jpg
 *         galleryImages:
 *           type: array
 *           items:
 *             type: string
 *         price:
 *           type: number
 *           description: Regular price in BDT (৳)
 *           example: 850
 *         discountPrice:
 *           type: number
 *           nullable: true
 *           description: Sale price in BDT (৳), must be less than price
 *           example: 750
 *         unit:
 *           type: string
 *           enum: [kg, g, l, ml, pcs]
 *           description: Unit the `weight` amount is measured in
 *           example: ml
 *         weight:
 *           type: number
 *           description: Amount, paired with `unit` (e.g. 500 with unit "ml")
 *           example: 500
 *         stock:
 *           type: integer
 *           example: 25
 *         isActive:
 *           type: boolean
 *           example: true
 *         isFeatured:
 *           type: boolean
 *           example: false
 *         sortOrder:
 *           type: integer
 *           example: 0
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     ProductInput:
 *       type: object
 *       required:
 *         - title
 *         - sku
 *         - category
 *         - price
 *       properties:
 *         title:
 *           type: string
 *         sku:
 *           type: string
 *         category:
 *           type: string
 *         brand:
 *           type: string
 *           nullable: true
 *         shortDescription:
 *           type: string
 *         overview:
 *           type: string
 *         price:
 *           type: number
 *         discountPrice:
 *           type: number
 *         unit:
 *           type: string
 *           enum: [kg, g, l, ml, pcs]
 *         weight:
 *           type: number
 *         stock:
 *           type: integer
 *         isActive:
 *           type: boolean
 *         isFeatured:
 *           type: boolean
 *         sortOrder:
 *           type: integer
 *         featureImage:
 *           type: string
 *           format: binary
 *         galleryImages:
 *           type: array
 *           items:
 *             type: string
 *             format: binary
 */
const productSchema = new Schema<IProduct>(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    sku: {
      type: String,
      required: [true, "SKU is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category is required"],
    },
    brand: {
      type: Schema.Types.ObjectId,
      ref: "Brand",
      default: null,
    },
    shortDescription: {
      type: String,
      trim: true,
      default: "",
    },
    overview: {
      type: String,
      trim: true,
      default: "",
    },
    featureImage: {
      type: String,
      trim: true,
      default: "",
    },
    galleryImages: {
      type: [String],
      default: [],
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
    },
    discountPrice: {
      type: Number,
      min: [0, "Discount price cannot be negative"],
    },
    unit: {
      type: String,
      enum: PRODUCT_UNITS,
      default: "pcs",
    },
    weight: {
      type: Number,
      min: [0, "Weight cannot be negative"],
      default: 0,
    },
    stock: {
      type: Number,
      min: [0, "Stock cannot be negative"],
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

productSchema.pre("validate", async function (next) {
  if (
    this.discountPrice !== undefined &&
    this.discountPrice !== null &&
    this.discountPrice >= this.price
  ) {
    this.invalidate(
      "discountPrice",
      "Discount price must be less than the regular price"
    );
  }

  if (this.isModified("title") || !this.slug) {
    const base = slugify(this.title);
    let candidate = base;
    let counter = 1;
    const ProductModel = this.constructor as Model<IProduct>;

    while (
      await ProductModel.exists({ slug: candidate, _id: { $ne: this._id } })
    ) {
      candidate = `${base}-${counter++}`;
    }

    this.slug = candidate;
  }

  next();
});

export const Product = mongoose.model<IProduct>("Product", productSchema);
