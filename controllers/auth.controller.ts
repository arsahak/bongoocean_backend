import type { Request, Response } from "express";
import { User, EMAIL_REGEX, type IUser } from "../models/user.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { generateToken } from "../utils/generateToken";

const normalizeEmail = (email: unknown) =>
  typeof email === "string" ? email.trim().toLowerCase() : undefined;

const normalizePhone = (phone: unknown) =>
  typeof phone === "string" ? phone.trim() : undefined;

const splitCustomerName = (name: string) => {
  const [firstName, ...remainingNames] = name.trim().split(/\s+/);
  return { firstName, lastName: remainingNames.join(" ") };
};

const authenticateUser = async (
  identifier: string,
  password: string
): Promise<IUser> => {
  const query = EMAIL_REGEX.test(identifier)
    ? { email: String(identifier).toLowerCase() }
    : { phone: identifier };

  const user = await User.findOne(query).select("+password");
  if (!user) throw new ApiError(401, "Invalid credentials");

  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw new ApiError(401, "Invalid credentials");

  return user;
};

export const signup = asyncHandler(async (req: Request, res: Response) => {
  const { name, address, password } = req.body;
  const email = normalizeEmail(req.body.email);
  const phone = normalizePhone(req.body.phone);
  const { firstName, lastName } = splitCustomerName(name);
  const normalizedAddress =
    typeof address === "string" ? { area: address.trim() } : address;

  if (email) {
    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) throw new ApiError(409, "Email is already registered");
  }

  if (phone) {
    const existing = await User.findOne({ phone });
    if (existing) throw new ApiError(409, "Phone number is already registered");
  }

  const user = await User.create({
    firstName,
    lastName,
    address: normalizedAddress,
    phone,
    email,
    password,
    role: "customer",
  });

  const token = generateToken({ id: String(user._id), role: user.role });

  return ApiResponse(res, 201, "Signup successful", { user, token });
});

export const signin = asyncHandler(async (req: Request, res: Response) => {
  const { identifier, password } = req.body;
  const user = await authenticateUser(String(identifier).trim(), password);

  if (user.role !== "customer") {
    throw new ApiError(401, "Invalid credentials");
  }
  if (user.isActive === false) {
    throw new ApiError(403, "Your account is inactive. Please contact support");
  }

  const token = generateToken({ id: String(user._id), role: user.role });

  return ApiResponse(res, 200, "Signin successful", { user, token });
});

export const staffSignin = asyncHandler(async (req: Request, res: Response) => {
  const { identifier, password } = req.body;
  const user = await authenticateUser(identifier, password);

  if (user.role === "customer") {
    throw new ApiError(403, "Not authorized as staff");
  }

  const token = generateToken({ id: String(user._id), role: user.role });

  return ApiResponse(res, 200, "Staff signin successful", { user, token });
});
