import type { Request, Response } from "express";
import mongoose from "mongoose";
import { User } from "../models/user.model";
import { Order } from "../models/order.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { deleteFromSpaces } from "../utils/uploadToSpaces";
import { logActivity } from "../utils/logActivity";

const parsePagination = (req: Request) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(
    50,
    Math.max(1, parseInt(String(req.query.limit ?? "10"), 10) || 10)
  );
  return { page, limit, skip: (page - 1) * limit };
};

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ensureUniqueContact = async (
  email?: string,
  phone?: string,
  excludeId?: string
) => {
  if (email) {
    const existing = await User.findOne({
      email: email.toLowerCase(),
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    });
    if (existing) throw new ApiError(409, "Email is already registered");
  }
  if (phone) {
    const existing = await User.findOne({
      phone,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    });
    if (existing) throw new ApiError(409, "Phone number is already registered");
  }
};

export const listCustomers = asyncHandler(
  async (req: Request, res: Response) => {
    const { page, limit, skip } = parsePagination(req);
    const match: Record<string, unknown> = { role: "customer" };
    const status = String(req.query.status ?? "all");
    if (!['all', 'active', 'inactive'].includes(status)) {
      throw new ApiError(400, "Status must be all, active, or inactive");
    }
    if (status === "active") {
      match.$and = [
        { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
      ];
    } else if (status === "inactive") {
      match.isActive = false;
    }

    const search = String(req.query.search ?? "").trim().slice(0, 100);
    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      match.$or = [
        { firstName: pattern },
        { lastName: pattern },
        { companyName: pattern },
        { email: pattern },
        { phone: pattern },
      ];
    }

    const [customers, total, active, inactive, revenue] = await Promise.all([
      User.aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: "orders",
            let: { customerId: "$_id" },
            pipeline: [
              { $match: { $expr: { $eq: ["$customer", "$$customerId"] } } },
              {
                $group: {
                  _id: null,
                  totalOrders: { $sum: 1 },
                  totalSpent: {
                    $sum: {
                      $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$total", 0],
                    },
                  },
                },
              },
            ],
            as: "orderStats",
          },
        },
        {
          $addFields: {
            isActive: { $ne: ["$isActive", false] },
            totalOrders: { $ifNull: [{ $first: "$orderStats.totalOrders" }, 0] },
            totalSpent: { $ifNull: [{ $first: "$orderStats.totalSpent" }, 0] },
          },
        },
        { $project: { password: 0, orderStats: 0 } },
      ]),
      User.countDocuments(match),
      User.countDocuments({
        role: "customer",
        $or: [{ isActive: true }, { isActive: { $exists: false } }],
      }),
      User.countDocuments({ role: "customer", isActive: false }),
      Order.aggregate<{ _id: null; total: number }>([
        { $match: { customer: { $ne: null }, paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]),
    ]);

    return ApiResponse(res, 200, "Customers fetched successfully", {
      customers,
      summary: {
        total: active + inactive,
        active,
        inactive,
        totalRevenue: revenue[0]?.total ?? 0,
      },
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasPreviousPage: page > 1,
        hasNextPage: page * limit < total,
      },
    });
  }
);

export const getCustomer = asyncHandler(async (req: Request, res: Response) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new ApiError(400, "Invalid customer id");
  }
  const customer = await User.findOne({
    _id: req.params.id,
    role: "customer",
  }).lean();
  if (!customer) throw new ApiError(404, "Customer not found");

  const stats = await Order.aggregate<{ _id: null; totalOrders: number; totalSpent: number }>([
    { $match: { customer: customer._id } },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalSpent: {
          $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$total", 0] },
        },
      },
    },
  ]);

  return ApiResponse(res, 200, "Customer fetched successfully", {
    ...customer,
    isActive: customer.isActive !== false,
    totalOrders: stats[0]?.totalOrders ?? 0,
    totalSpent: stats[0]?.totalSpent ?? 0,
  });
});

export const createCustomer = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      firstName,
      lastName,
      companyName,
      email,
      phone,
      password,
      address,
      isActive,
    } = req.body;
    await ensureUniqueContact(email, phone);

    const customer = await User.create({
      firstName,
      lastName,
      companyName,
      email: email || undefined,
      phone: phone || undefined,
      password,
      address,
      isActive: isActive ?? true,
      role: "customer",
    });
    const customerName = [customer.firstName, customer.lastName]
      .filter(Boolean)
      .join(" ");
    void logActivity({
      req,
      action: "create",
      module: "customer",
      resourceId: customer._id,
      resourceName: customerName,
      description: `Created customer "${customerName}"`,
    });

    return ApiResponse(res, 201, "Customer created successfully", customer);
  }
);

export const updateCustomer = asyncHandler(
  async (req: Request, res: Response) => {
    const customer = await User.findOne({
      _id: req.params.id,
      role: "customer",
    }).select("+password");
    if (!customer) throw new ApiError(404, "Customer not found");

    const {
      firstName,
      lastName,
      companyName,
      email,
      phone,
      password,
      address,
      isActive,
    } = req.body;
    const nextEmail = email === "" ? undefined : email;
    const nextPhone = phone === "" ? undefined : phone;
    const resultingEmail = email !== undefined ? nextEmail : customer.email;
    const resultingPhone = phone !== undefined ? nextPhone : customer.phone;
    if (!resultingEmail && !resultingPhone) {
      throw new ApiError(422, "Either email or phone is required");
    }
    await ensureUniqueContact(nextEmail, nextPhone, customer.id);

    if (firstName !== undefined) customer.firstName = firstName;
    if (lastName !== undefined) customer.lastName = lastName;
    if (companyName !== undefined) customer.companyName = companyName;
    if (email !== undefined) customer.email = nextEmail;
    if (phone !== undefined) customer.phone = nextPhone;
    if (address !== undefined) customer.address = address;
    if (isActive !== undefined) customer.isActive = isActive;
    if (password) customer.password = password;
    await customer.save();

    const customerName = [customer.firstName, customer.lastName]
      .filter(Boolean)
      .join(" ");
    void logActivity({
      req,
      action: "update",
      module: "customer",
      resourceId: customer._id,
      resourceName: customerName,
      description: `Updated customer "${customerName}"`,
    });

    return ApiResponse(res, 200, "Customer updated successfully", customer);
  }
);

export const deleteCustomer = asyncHandler(
  async (req: Request, res: Response) => {
    const customer = await User.findOne({
      _id: req.params.id,
      role: "customer",
    });
    if (!customer) throw new ApiError(404, "Customer not found");

    const customerName = [customer.firstName, customer.lastName]
      .filter(Boolean)
      .join(" ");
    const avatarKey = customer.avatarKey;
    await customer.deleteOne();
    if (avatarKey) await deleteFromSpaces(avatarKey);

    void logActivity({
      req,
      action: "delete",
      module: "customer",
      resourceId: customer._id,
      resourceName: customerName,
      description: `Deleted customer "${customerName}"`,
    });

    return ApiResponse(res, 200, "Customer deleted successfully");
  }
);
