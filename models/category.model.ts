import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICategory extends Document {
  name: string;
  slug: string;
  description?: string;
  image?: string;
  // DigitalOcean Spaces object key backing `image`, kept only to delete the
  // old file on replace/removal — not shown in swagger docs.
  imageKey?: string;
  parent?: mongoose.Types.ObjectId | null;
  isActive: boolean;
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
 *     Category:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 656f1c2e8f1b2c0012a34567
 *         name:
 *           type: string
 *           example: Freshwater Aquariums
 *         slug:
 *           type: string
 *           example: freshwater-aquariums
 *         description:
 *           type: string
 *           example: Tanks, kits, and accessories for freshwater setups
 *         image:
 *           type: string
 *           description: Hosted on DigitalOcean Spaces
 *           example: https://bongoocean.nyc3.digitaloceanspaces.com/bongoocean/categories/freshwater.jpg
 *         parent:
 *           type: string
 *           nullable: true
 *           description: Parent category id, for subcategories
 *           example: null
 *         isActive:
 *           type: boolean
 *           example: true
 *         sortOrder:
 *           type: integer
 *           example: 0
 *         productCount:
 *           type: integer
 *           readOnly: true
 *           description: Number of active products assigned to this category
 *           example: 12
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     CategoryInput:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         parent:
 *           type: string
 *           nullable: true
 *         isActive:
 *           type: boolean
 *         sortOrder:
 *           type: integer
 *         image:
 *           type: string
 *           format: binary
 */
const categorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      unique: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    image: {
      type: String,
      trim: true,
      default: "",
    },
    imageKey: {
      type: String,
      trim: true,
      default: "",
    },
    parent: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

categorySchema.pre("validate", async function (next) {
  if (this.parent && String(this.parent) === String(this._id)) {
    this.invalidate("parent", "A category cannot be its own parent");
  }

  if (this.isModified("name") || !this.slug) {
    const base = slugify(this.name);
    let candidate = base;
    let counter = 1;
    const CategoryModel = this.constructor as Model<ICategory>;

    while (
      await CategoryModel.exists({ slug: candidate, _id: { $ne: this._id } })
    ) {
      candidate = `${base}-${counter++}`;
    }

    this.slug = candidate;
  }

  next();
});

export const Category = mongoose.model<ICategory>("Category", categorySchema);
