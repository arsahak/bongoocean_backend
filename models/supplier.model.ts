import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISupplier extends Document {
  name: string;
  slug: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  logo?: string;
  description?: string;
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
 *     Supplier:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 656f1c2e8f1b2c0012a34567
 *         name:
 *           type: string
 *           example: Ocean Aqua Traders
 *         slug:
 *           type: string
 *           example: ocean-aqua-traders
 *         contactPerson:
 *           type: string
 *           example: Rafiq Islam
 *         email:
 *           type: string
 *           example: sales@oceanaquatraders.com
 *         phone:
 *           type: string
 *           example: +8801700000000
 *         address:
 *           type: string
 *           example: 12 Motijheel C/A, Dhaka
 *         website:
 *           type: string
 *           example: https://oceanaquatraders.com
 *         logo:
 *           type: string
 *           example: https://i.ibb.co/xxxx/ocean-aqua.jpg
 *         description:
 *           type: string
 *           example: Wholesale supplier of aquarium livestock and equipment
 *         isActive:
 *           type: boolean
 *           example: true
 *         sortOrder:
 *           type: integer
 *           example: 0
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     SupplierInput:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *         contactPerson:
 *           type: string
 *         email:
 *           type: string
 *         phone:
 *           type: string
 *         address:
 *           type: string
 *         website:
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
const supplierSchema = new Schema<ISupplier>(
  {
    name: {
      type: String,
      required: [true, "Supplier name is required"],
      trim: true,
      unique: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    contactPerson: {
      type: String,
      trim: true,
      default: "",
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    website: {
      type: String,
      trim: true,
      default: "",
    },
    logo: {
      type: String,
      trim: true,
      default: "",
    },
    description: {
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

supplierSchema.pre("validate", async function (next) {
  if (this.isModified("name") || !this.slug) {
    const base = slugify(this.name);
    let candidate = base;
    let counter = 1;
    const SupplierModel = this.constructor as Model<ISupplier>;

    while (
      await SupplierModel.exists({ slug: candidate, _id: { $ne: this._id } })
    ) {
      candidate = `${base}-${counter++}`;
    }

    this.slug = candidate;
  }

  next();
});

export const Supplier = mongoose.model<ISupplier>("Supplier", supplierSchema);
