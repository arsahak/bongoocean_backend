import mongoose, { Schema, Document, Model } from "mongoose";
import bcrypt from "bcryptjs";

export const VENDOR_STATUSES = [
  "active",
  "pending",
  "inactive",
  "disabled",
] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];

export const VENDOR_LEVELS = ["verified", "trusted", "top_rated"] as const;
export type VendorLevel = (typeof VENDOR_LEVELS)[number];

export const VENDOR_OWNERSHIPS = ["own", "third_party"] as const;
export type VendorOwnership = (typeof VENDOR_OWNERSHIPS)[number];

export interface IVendorDocument {
  url: string;
  key: string;
  name: string;
  size: number;
}

export interface IVendorCategoryCommission {
  category: string;
  rate: number;
}

export interface IVendor extends Document {
  name: string;
  slug: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  socialLink?: string;
  password?: string;
  description?: string;
  status: VendorStatus;
  level: VendorLevel;
  ownership: VendorOwnership;
  categories: string[];
  commissionRate?: number;
  categoryCommissions: IVendorCategoryCommission[];
  commissionNotes?: string;
  logo?: IVendorDocument;
  coverImage?: IVendorDocument;
  agreementDocument?: IVendorDocument;
  businessDocuments: IVendorDocument[];
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");

const vendorDocumentSchema = new Schema<IVendorDocument>(
  {
    url: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    size: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const categoryCommissionSchema = new Schema<IVendorCategoryCommission>(
  {
    category: { type: String, required: true, trim: true },
    rate: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false },
);

/**
 * @swagger
 * components:
 *   schemas:
 *     VendorDocument:
 *       type: object
 *       properties:
 *         url:
 *           type: string
 *         name:
 *           type: string
 *         size:
 *           type: integer
 *     VendorCategoryCommission:
 *       type: object
 *       properties:
 *         category:
 *           type: string
 *         rate:
 *           type: number
 *     Vendor:
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
 *         email:
 *           type: string
 *         phone:
 *           type: string
 *         address:
 *           type: string
 *         website:
 *           type: string
 *         socialLink:
 *           type: string
 *         description:
 *           type: string
 *         status:
 *           type: string
 *           enum: [active, pending, inactive, disabled]
 *         level:
 *           type: string
 *           enum: [verified, trusted, top_rated]
 *         ownership:
 *           type: string
 *           enum: [own, third_party]
 *         categories:
 *           type: array
 *           items:
 *             type: string
 *         commissionRate:
 *           type: number
 *         categoryCommissions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/VendorCategoryCommission'
 *         commissionNotes:
 *           type: string
 *         logo:
 *           $ref: '#/components/schemas/VendorDocument'
 *         coverImage:
 *           $ref: '#/components/schemas/VendorDocument'
 *         agreementDocument:
 *           $ref: '#/components/schemas/VendorDocument'
 *         businessDocuments:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/VendorDocument'
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     VendorInput:
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
 *         socialLink:
 *           type: string
 *         password:
 *           type: string
 *           format: password
 *           description: Sets/changes the vendor's own dashboard login. Omit to leave unchanged.
 *         description:
 *           type: string
 *         status:
 *           type: string
 *           enum: [active, pending, inactive, disabled]
 *         level:
 *           type: string
 *           enum: [verified, trusted, top_rated]
 *         ownership:
 *           type: string
 *           enum: [own, third_party]
 *         categories:
 *           type: string
 *           description: JSON-encoded array of category names
 *         commissionRate:
 *           type: number
 *         categoryCommissions:
 *           type: string
 *           description: JSON-encoded array of { category, rate }
 *         commissionNotes:
 *           type: string
 *         logo:
 *           type: string
 *           format: binary
 *         coverImage:
 *           type: string
 *           format: binary
 *         agreementDocument:
 *           type: string
 *           format: binary
 *         businessDocuments:
 *           type: array
 *           items:
 *             type: string
 *             format: binary
 */
const vendorSchema = new Schema<IVendor>(
  {
    name: {
      type: String,
      required: [true, "Vendor name is required"],
      trim: true,
      unique: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    contactPerson: { type: String, trim: true, default: "" },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      default: undefined,
    },
    phone: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    website: { type: String, trim: true, default: "" },
    socialLink: { type: String, trim: true, default: "" },
    password: {
      type: String,
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    description: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: VENDOR_STATUSES,
      default: "active",
    },
    level: {
      type: String,
      enum: VENDOR_LEVELS,
      default: "verified",
    },
    ownership: {
      type: String,
      enum: VENDOR_OWNERSHIPS,
      default: "own",
    },
    categories: {
      type: [String],
      default: [],
    },
    commissionRate: {
      type: Number,
      min: [0, "Commission rate cannot be negative"],
      max: [100, "Commission rate cannot exceed 100"],
      default: 0,
    },
    categoryCommissions: {
      type: [categoryCommissionSchema],
      default: [],
    },
    commissionNotes: { type: String, trim: true, default: "" },
    logo: { type: vendorDocumentSchema, default: undefined },
    coverImage: { type: vendorDocumentSchema, default: undefined },
    agreementDocument: {
      type: vendorDocumentSchema,
      default: undefined,
    },
    businessDocuments: {
      type: [vendorDocumentSchema],
      default: [],
    },
  },
  { timestamps: true },
);

vendorSchema.pre("validate", async function (next) {
  if (this.isModified("name") || !this.slug) {
    const base = slugify(this.name);
    let candidate = base;
    let counter = 1;
    const VendorModel = this.constructor as Model<IVendor>;

    while (
      await VendorModel.exists({ slug: candidate, _id: { $ne: this._id } })
    ) {
      candidate = `${base}-${counter++}`;
    }

    this.slug = candidate;
  }

  next();
});

vendorSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

vendorSchema.methods.comparePassword = function (
  candidate: string,
): Promise<boolean> {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
};

vendorSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { password, ...rest } = ret as typeof ret & { password?: string };
    return rest;
  },
});

export const Vendor = mongoose.model<IVendor>("Vendor", vendorSchema);
