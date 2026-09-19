import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

export const USER_ROLES = ["customer", "manager", "admin", "superadmin"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const BD_DIVISIONS = [
  "Dhaka",
  "Chattogram",
  "Rajshahi",
  "Khulna",
  "Barishal",
  "Sylhet",
  "Rangpur",
  "Mymensingh",
] as const;

export type BdDivision = (typeof BD_DIVISIONS)[number];

export const DELIVERY_ZONES = ["Inside Dhaka", "Outside Dhaka"] as const;

export type DeliveryZone = (typeof DELIVERY_ZONES)[number];

export interface IAddress {
  division?: BdDivision;
  district?: string;
  upazila?: string;
  postOffice?: string;
  postCode?: string;
  area?: string;
  zone?: DeliveryZone;
}

export interface IUser extends Document {
  firstName: string;
  lastName: string;
  companyName?: string;
  address?: IAddress;
  shipToDifferentAddress: boolean;
  shippingAddress?: IAddress;
  phone?: string;
  email?: string;
  avatar?: string;
  // DigitalOcean Spaces object key backing `avatar`, kept only to delete the
  // old file on replace/removal — not shown in swagger docs.
  avatarKey?: string;
  password: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_REGEX = /^[+]?[0-9]{7,15}$/;
const POST_CODE_REGEX = /^[0-9]{4}$/;

const addressSchema = new Schema<IAddress>(
  {
    division: {
      type: String,
      enum: BD_DIVISIONS,
    },
    district: { type: String, trim: true, default: "" },
    upazila: { type: String, trim: true, default: "" },
    postOffice: { type: String, trim: true, default: "" },
    postCode: {
      type: String,
      trim: true,
      default: "",
      match: [POST_CODE_REGEX, "Please enter a valid 4-digit post code"],
    },
    area: { type: String, trim: true, default: "" },
    zone: {
      type: String,
      enum: DELIVERY_ZONES,
    },
  },
  { _id: false }
);

/**
 * @swagger
 * components:
 *   schemas:
 *     Address:
 *       type: object
 *       description: Bangladesh-style address (division/district/upazila/post code)
 *       properties:
 *         division:
 *           type: string
 *           enum: [Dhaka, Chattogram, Rajshahi, Khulna, Barishal, Sylhet, Rangpur, Mymensingh]
 *           example: Dhaka
 *         district:
 *           type: string
 *           example: Dhaka
 *         upazila:
 *           type: string
 *           example: Savar
 *         postOffice:
 *           type: string
 *           example: Savar
 *         postCode:
 *           type: string
 *           example: "1340"
 *         area:
 *           type: string
 *           example: House 12, Road 4, Sector 10, Uttara
 *         zone:
 *           type: string
 *           enum: [Inside Dhaka, Outside Dhaka]
 *           description: Delivery zone, used for shipping rate calculation
 *           example: Inside Dhaka
 *     User:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 656f1c2e8f1b2c0012a34567
 *         firstName:
 *           type: string
 *           example: John
 *         lastName:
 *           type: string
 *           example: Doe
 *         name:
 *           type: string
 *           example: John Doe
 *         companyName:
 *           type: string
 *           example: Fish Me Aqua Ltd.
 *         address:
 *           $ref: '#/components/schemas/Address'
 *         shipToDifferentAddress:
 *           type: boolean
 *           description: Whether checkout should use the separately saved shipping address
 *           example: false
 *         shippingAddress:
 *           $ref: '#/components/schemas/Address'
 *         phone:
 *           type: string
 *           example: "+8801234567890"
 *         email:
 *           type: string
 *           example: john@example.com
 *         avatar:
 *           type: string
 *           example: https://example.com/avatars/john.jpg
 *         role:
 *           type: string
 *           enum: [customer, manager, admin, superadmin]
 *           example: customer
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     UserSignupInput:
 *       type: object
 *       required:
 *         - name
 *         - address
 *         - password
 *       description: Either email or phone must be provided.
 *       properties:
 *         name:
 *           type: string
 *         address:
 *           oneOf:
 *             - type: string
 *               example: House 12, Road 4, Uttara, Dhaka
 *             - $ref: '#/components/schemas/Address'
 *         phone:
 *           type: string
 *         email:
 *           type: string
 *         password:
 *           type: string
 *           format: password
 *           minLength: 8
 *           maxLength: 72
 */
const userSchema = new Schema<IUser>(
  {
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
      default: "",
    },
    companyName: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      type: addressSchema,
      default: () => ({}),
    },
    shipToDifferentAddress: {
      type: Boolean,
      default: false,
    },
    shippingAddress: {
      type: addressSchema,
      default: undefined,
    },
    phone: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      match: [PHONE_REGEX, "Please enter a valid phone number"],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      match: [EMAIL_REGEX, "Please enter a valid email address"],
    },
    avatar: {
      type: String,
      trim: true,
      default: "",
    },
    avatarKey: {
      type: String,
      trim: true,
      default: "",
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      default: "customer",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

userSchema.pre("validate", function (next) {
  if (!this.email && !this.phone) {
    this.invalidate("email", "Either email or phone is required");
  }
  next();
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (
  candidate: string
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

userSchema.virtual("name").get(function () {
  return [this.firstName, this.lastName].filter(Boolean).join(" ");
});

userSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    const { password, ...rest } = ret as typeof ret & { password?: string };
    return rest;
  },
});

export const User = mongoose.model<IUser>("User", userSchema);
