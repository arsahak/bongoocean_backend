import type { Request, Response } from "express";
import { User, type UserRole } from "../models/user.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { uploadToSpaces, deleteFromSpaces } from "../utils/uploadToSpaces";
import { logActivity } from "../utils/logActivity";

const CREATABLE_ROLES_BY: Record<UserRole, UserRole[]> = {
  superadmin: ["manager", "admin", "superadmin"],
  admin: ["manager"],
  manager: [],
  customer: [],
};

export const createStaff = asyncHandler(async (req: Request, res: Response) => {
  const {
    firstName,
    lastName,
    companyName,
    address,
    phone,
    email,
    avatar,
    password,
    role,
  } = req.body;

  const requester = req.user!;
  const allowedRoles = CREATABLE_ROLES_BY[requester.role];

  if (!allowedRoles.includes(role)) {
    throw new ApiError(
      403,
      `You are not allowed to create a user with role "${role}"`
    );
  }

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
    companyName,
    address,
    phone,
    email,
    avatar,
    password,
    role,
  });

  const staffName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  void logActivity({
    req,
    action: "create",
    module: "staff",
    resourceId: user._id,
    resourceName: staffName,
    description: `Created staff user "${staffName}" (${role})`,
  });

  return ApiResponse(res, 201, "Staff user created successfully", user);
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  return ApiResponse(res, 200, "Profile fetched successfully", req.user);
});

// Roles & Permissions: viewing is broader than managing — a requester always
// sees their own role tier too (peers + self), even though CREATABLE_ROLES_BY
// (used for create/update/delete below) may not let them manage that tier.
// superadmin sees manager/admin/superadmin; admin sees manager/admin.
export const listStaff = asyncHandler(async (req: Request, res: Response) => {
  const requester = req.user!;
  const manageableRoles = CREATABLE_ROLES_BY[requester.role];
  const visibleRoles = Array.from(
    new Set([...manageableRoles, requester.role])
  );

  const staff = await User.find({ role: { $in: visibleRoles } }).sort({
    createdAt: -1,
  });

  return ApiResponse(res, 200, "Staff fetched successfully", staff);
});

export const updateStaff = asyncHandler(async (req: Request, res: Response) => {
  const requester = req.user!;
  const manageableRoles = CREATABLE_ROLES_BY[requester.role];

  const target = await User.findOne({
    _id: req.params.id,
    role: { $in: manageableRoles },
  });
  if (!target) throw new ApiError(404, "Staff member not found");

  if (target.id === requester.id) {
    throw new ApiError(
      400,
      "Use your own profile settings to update your account"
    );
  }

  const { firstName, lastName, email, phone, role } = req.body;

  if (role !== undefined && !manageableRoles.includes(role)) {
    throw new ApiError(
      403,
      `You are not allowed to assign the role "${role}"`
    );
  }

  if (email && email.toLowerCase() !== target.email) {
    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) throw new ApiError(409, "Email is already registered");
  }

  if (phone && phone !== target.phone) {
    const existing = await User.findOne({ phone });
    if (existing) throw new ApiError(409, "Phone number is already registered");
  }

  if (firstName !== undefined) target.firstName = firstName;
  if (lastName !== undefined) target.lastName = lastName;
  if (email !== undefined) target.email = email;
  if (phone !== undefined) target.phone = phone;
  if (role !== undefined) target.role = role;

  await target.save();

  const staffName = [target.firstName, target.lastName]
    .filter(Boolean)
    .join(" ");
  void logActivity({
    req,
    action: "update",
    module: "staff",
    resourceId: target._id,
    resourceName: staffName,
    description: `Updated staff user "${staffName}"`,
  });

  return ApiResponse(res, 200, "Staff member updated successfully", target);
});

export const deleteStaff = asyncHandler(async (req: Request, res: Response) => {
  const requester = req.user!;
  const manageableRoles = CREATABLE_ROLES_BY[requester.role];

  const target = await User.findOne({
    _id: req.params.id,
    role: { $in: manageableRoles },
  });
  if (!target) throw new ApiError(404, "Staff member not found");

  if (target.id === requester.id) {
    throw new ApiError(400, "You cannot delete your own account");
  }

  const staffName = [target.firstName, target.lastName]
    .filter(Boolean)
    .join(" ");
  const avatarKey = target.avatarKey;
  await target.deleteOne();
  if (avatarKey) await deleteFromSpaces(avatarKey);

  void logActivity({
    req,
    action: "delete",
    module: "staff",
    resourceId: target._id,
    resourceName: staffName,
    description: `Deleted staff user "${staffName}"`,
  });

  return ApiResponse(res, 200, "Staff member deleted successfully");
});

// General settings: any authenticated user editing their own account.
export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const requester = req.user!;
  const {
    firstName,
    lastName,
    email,
    phone,
    companyName,
    address,
    shipToDifferentAddress,
    shippingAddress,
  } = req.body;

  if (email && email.toLowerCase() !== requester.email) {
    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) throw new ApiError(409, "Email is already registered");
  }

  if (phone && phone !== requester.phone) {
    const existing = await User.findOne({ phone });
    if (existing) throw new ApiError(409, "Phone number is already registered");
  }

  if (firstName !== undefined) requester.firstName = firstName;
  if (lastName !== undefined) requester.lastName = lastName;
  if (email !== undefined) requester.email = email;
  if (phone !== undefined) requester.phone = phone;
  if (companyName !== undefined) requester.companyName = companyName;
  if (address !== undefined) requester.address = address;
  if (shipToDifferentAddress !== undefined) {
    requester.shipToDifferentAddress = shipToDifferentAddress;
    if (!shipToDifferentAddress) requester.shippingAddress = undefined;
  }
  if (shippingAddress !== undefined && shipToDifferentAddress !== false) {
    requester.shippingAddress = shippingAddress;
  }

  await requester.save();

  return ApiResponse(res, 200, "Profile updated successfully", requester);
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  const requester = await User.findById(req.user!.id).select("+password");
  if (!requester) throw new ApiError(401, "User no longer exists");

  const matches = await requester.comparePassword(currentPassword);
  if (!matches) throw new ApiError(401, "Current password is incorrect");

  requester.password = newPassword;
  await requester.save();

  return ApiResponse(res, 200, "Password updated successfully");
});

export const updateAvatar = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError(422, "Avatar image file is required");

  const requester = req.user!;
  const previousAvatarKey = requester.avatarKey;

  const uploaded = await uploadToSpaces(req.file, "avatars");
  requester.avatar = uploaded.url;
  requester.avatarKey = uploaded.key;

  try {
    await requester.save();
  } catch (err) {
    await deleteFromSpaces(uploaded.key);
    throw err;
  }

  if (previousAvatarKey) {
    await deleteFromSpaces(previousAvatarKey);
  }

  return ApiResponse(res, 200, "Avatar updated successfully", requester);
});
