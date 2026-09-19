import mongoose, { Schema, Document, Model } from "mongoose";

export const PRODUCT_UNITS = ["kg", "g", "l", "ml", "pcs"] as const;

export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export const PRODUCT_VIDEO_SOURCES = ["upload", "youtube"] as const;

export type ProductVideoSource = (typeof PRODUCT_VIDEO_SOURCES)[number] | "";

// How long a product stays in the "New Arrival" section after being flagged.
export const NEW_ARRIVAL_WINDOW_DAYS = 30;
export const NEW_ARRIVAL_WINDOW_MS = NEW_ARRIVAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export interface IProduct extends Document {
  title: string;
  slug: string;
  sku: string;
  category: mongoose.Types.ObjectId;
  brand?: mongoose.Types.ObjectId | null;
  // Null/unset means this is the shop's own product. Set means it's supplied
  // by that vendor — used to route orders, commission, and stock to them.
  vendor?: mongoose.Types.ObjectId | null;
  shortDescription: string;
  overview: string;
  featureImage: string;
  // DigitalOcean Spaces object key backing featureImage, kept only to
  // delete the old file on replace/removal — not shown in swagger docs.
  featureImageKey: string;
  galleryImages: string[];
  // Parallel to galleryImages (same order/length) — each entry is that
  // image's Spaces object key, for deletion on replace/removal.
  galleryImageKeys: string[];
  // Optional single product video, alongside the gallery images. "upload"
  // means videoKey identifies the DigitalOcean Spaces object (for deletion
  // on replace/removal); "youtube" means videoUrl is a canonical embed URL
  // and videoKey is unused.
  videoUrl: string;
  videoSource: ProductVideoSource;
  videoKey: string;
  price: number;
  discountPrice?: number;
  unit: ProductUnit;
  weight: number;
  stock: number;
  isActive: boolean;
  isFeatured: boolean;
  isTrending: boolean;
  // Manual flag, but self-expiring: set true and stamped with newArrivalSetAt
  // whenever it's turned on, then automatically cleared once
  // NEW_ARRIVAL_WINDOW_DAYS has elapsed (see pre-save hook below and the
  // lazy-expiry sweep run before list/detail reads in the controller).
  isNewArrival: boolean;
  newArrivalSetAt?: Date | null;
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
 *           example: BOO-OW-500ML
 *         category:
 *           type: string
 *           description: Category id (populated with { name, slug } on read endpoints)
 *         brand:
 *           type: string
 *           nullable: true
 *           description: Brand id (populated with { name, slug } on read endpoints)
 *         vendor:
 *           type: string
 *           nullable: true
 *           description: Vendor id this product is supplied by (populated with { name, slug } on read endpoints); null means it's the shop's own product
 *         shortDescription:
 *           type: string
 *           example: Instantly removes chlorine and detoxifies heavy metals
 *         overview:
 *           type: string
 *           example: A full-length description of the product, its ingredients, and how to use it.
 *         featureImage:
 *           type: string
 *           description: Hosted on DigitalOcean Spaces
 *           example: https://bongoocean.nyc3.digitaloceanspaces.com/bongoocean/products/stress-coat.jpg
 *         galleryImages:
 *           type: array
 *           items:
 *             type: string
 *         videoUrl:
 *           type: string
 *           description: >
 *             Direct-uploaded videos are hosted on DigitalOcean Spaces;
 *             YouTube videos are stored as a canonical
 *             https://www.youtube.com/embed/{id} URL. Empty when there's no
 *             video.
 *           example: https://bongoocean.nyc3.digitaloceanspaces.com/bongoocean/products/video/abc123.mp4
 *         videoSource:
 *           type: string
 *           enum: [upload, youtube, ""]
 *           description: Empty string means no video is set.
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
 *         isTrending:
 *           type: boolean
 *           example: false
 *         isNewArrival:
 *           type: boolean
 *           example: false
 *           description: >
 *             Auto-expires 30 days after being set true — see
 *             newArrivalSetAt.
 *         newArrivalSetAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: When isNewArrival was last turned on; read-only.
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
 *         vendor:
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
 *         isTrending:
 *           type: boolean
 *         isNewArrival:
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
 *         video:
 *           type: string
 *           format: binary
 *           description: A video file — send this alongside videoSource=upload
 *         videoSource:
 *           type: string
 *           enum: [upload, youtube]
 *           description: >
 *             "upload" pairs with a `video` file; "youtube" pairs with a
 *             `videoUrl` link (any youtube.com/youtu.be URL shape).
 *         videoUrl:
 *           type: string
 *           description: A YouTube URL — only read when videoSource=youtube
 *         removeVideo:
 *           type: boolean
 *           description: Update only — clears the existing video
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
    vendor: {
      type: Schema.Types.ObjectId,
      ref: "Vendor",
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
    featureImageKey: {
      type: String,
      trim: true,
      default: "",
    },
    galleryImages: {
      type: [String],
      default: [],
    },
    galleryImageKeys: {
      type: [String],
      default: [],
    },
    videoUrl: {
      type: String,
      trim: true,
      default: "",
    },
    videoSource: {
      type: String,
      enum: [...PRODUCT_VIDEO_SOURCES, ""],
      default: "",
    },
    videoKey: {
      type: String,
      trim: true,
      default: "",
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
    isTrending: {
      type: Boolean,
      default: false,
    },
    isNewArrival: {
      type: Boolean,
      default: false,
    },
    newArrivalSetAt: {
      type: Date,
      default: null,
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

  if (this.isModified("isNewArrival")) {
    // Re-stamp the window every time it's (re-)turned on, so re-marking an
    // old "new arrival" product restarts its 30 days instead of doing nothing.
    this.newArrivalSetAt = this.isNewArrival ? new Date() : null;
  } else if (
    this.isNewArrival &&
    this.newArrivalSetAt &&
    Date.now() - this.newArrivalSetAt.getTime() > NEW_ARRIVAL_WINDOW_MS
  ) {
    // Self-heal on any other save: a flag nobody touched but that has aged
    // past the window shouldn't silently keep showing as "new".
    this.isNewArrival = false;
    this.newArrivalSetAt = null;
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

// Reads (list/detail) don't go through the pre-save hook above, so a flag
// that aged past its window would otherwise keep showing as "new" until the
// document is next written. Call this before serving those reads to clear
// any that expired since the last write.
export async function expireStaleNewArrivals(): Promise<void> {
  await Product.updateMany(
    {
      isNewArrival: true,
      newArrivalSetAt: { $lt: new Date(Date.now() - NEW_ARRIVAL_WINDOW_MS) },
    },
    { $set: { isNewArrival: false, newArrivalSetAt: null } }
  );
}
