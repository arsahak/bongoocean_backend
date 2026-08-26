import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBrand extends Document {
  name: string;
  slug: string;
  description?: string;
  logo?: string;
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
 *     Brand:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 656f1c2e8f1b2c0012a34567
 *         name:
 *           type: string
 *           example: Aqua One
 *         slug:
 *           type: string
 *           example: aqua-one
 *         description:
 *           type: string
 *           example: Aquarium filtration and lighting equipment
 *         logo:
 *           type: string
 *           example: https://i.ibb.co/xxxx/aqua-one.jpg
 *         isActive:
 *           type: boolean
 *           example: true
 *         sortOrder:
 *           type: integer
 *           example: 0
 *         productCount:
 *           type: integer
 *           readOnly: true
 *           description: Number of active products assigned to this brand
 *           example: 8
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     BrandInput:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         isActive:
 *           type: boolean
 *         sortOrder:
 *           type: integer
 *         logo:
 *           type: string
 *           format: binary
 */
const brandSchema = new Schema<IBrand>(
  {
    name: {
      type: String,
      required: [true, "Brand name is required"],
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
    logo: {
      type: String,
      trim: true,
      default: "",
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

brandSchema.pre("validate", async function (next) {
  if (this.isModified("name") || !this.slug) {
    const base = slugify(this.name);
    let candidate = base;
    let counter = 1;
    const BrandModel = this.constructor as Model<IBrand>;

    while (
      await BrandModel.exists({ slug: candidate, _id: { $ne: this._id } })
    ) {
      candidate = `${base}-${counter++}`;
    }

    this.slug = candidate;
  }

  next();
});

export const Brand = mongoose.model<IBrand>("Brand", brandSchema);
