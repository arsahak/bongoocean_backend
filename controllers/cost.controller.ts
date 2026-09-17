import type { Request, Response } from "express";
import {
  Cost,
  COST_PAYERS,
  type ICostAttachment,
} from "../models/cost.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import {
  deleteFromCloudinary,
  uploadToCloudinary,
} from "../utils/uploadToCloudinary";
import { logActivity } from "../utils/logActivity";

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const dhakaPeriodBoundaries = () => {
  const offsetMs = 6 * 60 * 60 * 1000;
  const dhakaNow = new Date(Date.now() + offsetMs);
  const year = dhakaNow.getUTCFullYear();
  const month = dhakaNow.getUTCMonth();
  const day = dhakaNow.getUTCDate();
  return {
    todayStart: new Date(Date.UTC(year, month, day) - offsetMs),
    tomorrowStart: new Date(Date.UTC(year, month, day + 1) - offsetMs),
    monthStart: new Date(Date.UTC(year, month, 1) - offsetMs),
    nextMonthStart: new Date(Date.UTC(year, month + 1, 1) - offsetMs),
  };
};

const attachmentFromFile = async (
  file: Express.Multer.File,
): Promise<ICostAttachment> => {
  const upload = await uploadToCloudinary(file, "costing");
  return {
    url: upload.url,
    publicId: upload.publicId,
    resourceType: upload.resourceType,
    name: file.originalname,
    type: upload.resourceType,
    size: file.size,
  };
};

export const getCosts = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(req.query.limit || "10"), 10) || 10),
  );
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (req.query.category) filter.category = String(req.query.category);
  if (
    req.query.paidBy &&
    COST_PAYERS.includes(String(req.query.paidBy) as (typeof COST_PAYERS)[number])
  ) {
    filter.paidBy = String(req.query.paidBy);
  }
  if (req.query.search) {
    const search = escapeRegex(String(req.query.search).trim().slice(0, 100));
    if (search) {
      const pattern = { $regex: search, $options: "i" };
      filter.$or = [
        { title: pattern },
        { reason: pattern },
        { reference: pattern },
        { customCategory: pattern },
        { paidBy: pattern },
      ];
    }
  }

  const { todayStart, tomorrowStart, monthStart, nextMonthStart } =
    dhakaPeriodBoundaries();

  const [costs, total, summaryRows] = await Promise.all([
    Cost.find(filter)
      .populate("createdBy", "firstName lastName role")
      .populate("updatedBy", "firstName lastName role")
      .sort({ expenseDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Cost.countDocuments(filter),
    Cost.aggregate<{
      total: number;
      totalAmount: number;
      monthAmount: number;
      todayAmount: number;
      todayCount: number;
      attachmentCount: number;
    }>([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          monthAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ["$expenseDate", monthStart] },
                    { $lt: ["$expenseDate", nextMonthStart] },
                  ],
                },
                "$amount",
                0,
              ],
            },
          },
          todayAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ["$expenseDate", todayStart] },
                    { $lt: ["$expenseDate", tomorrowStart] },
                  ],
                },
                "$amount",
                0,
              ],
            },
          },
          todayCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ["$expenseDate", todayStart] },
                    { $lt: ["$expenseDate", tomorrowStart] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          attachmentCount: {
            $sum: { $cond: [{ $ne: [{ $type: "$attachment" }, "missing"] }, 1, 0] },
          },
        },
      },
    ]),
  ]);

  const summary = summaryRows[0] ?? {
    total: 0,
    totalAmount: 0,
    monthAmount: 0,
    todayAmount: 0,
    todayCount: 0,
    attachmentCount: 0,
  };

  return ApiResponse(res, 200, "Costs fetched successfully", {
    costs,
    summary,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const createCost = asyncHandler(async (req: Request, res: Response) => {
  let attachment: ICostAttachment | undefined;

  try {
    if (req.file) attachment = await attachmentFromFile(req.file);

    const cost = await Cost.create({
      title: req.body.title,
      category: req.body.category,
      customCategory: req.body.customCategory,
      reason: req.body.reason,
      amount: req.body.amount,
      expenseDate: req.body.expenseDate,
      paymentMethod: req.body.paymentMethod,
      paidBy: req.body.paidBy,
      reference: req.body.reference,
      comment: req.body.comment,
      attachment,
      createdBy: req.user!._id,
    });

    void logActivity({
      req,
      action: "create",
      module: "costing",
      resourceId: cost._id,
      resourceName: cost.title,
      description: `Added cost "${cost.title}" (${cost.amount} BDT)`,
    });

    return ApiResponse(res, 201, "Cost added successfully", cost);
  } catch (error) {
    if (attachment) {
      await deleteFromCloudinary(attachment.publicId, attachment.resourceType);
    }
    throw error;
  }
});

export const updateCost = asyncHandler(async (req: Request, res: Response) => {
  const cost = await Cost.findById(req.params.id);
  if (!cost) throw new ApiError(404, "Cost not found");

  const previousAttachment = cost.attachment;
  let uploadedAttachment: ICostAttachment | undefined;

  try {
    if (req.file) uploadedAttachment = await attachmentFromFile(req.file);

    const editableFields = [
      "title",
      "category",
      "customCategory",
      "reason",
      "amount",
      "expenseDate",
      "paymentMethod",
      "paidBy",
      "reference",
      "comment",
    ] as const;
    for (const field of editableFields) {
      if (req.body[field] !== undefined) {
        (cost as unknown as Record<string, unknown>)[field] = req.body[field];
      }
    }

    if (uploadedAttachment) {
      cost.attachment = uploadedAttachment;
    } else if (req.body.removeAttachment === true) {
      cost.attachment = undefined;
    }
    cost.updatedBy = req.user!._id;
    await cost.save();

    if (
      previousAttachment &&
      (uploadedAttachment || req.body.removeAttachment === true)
    ) {
      void deleteFromCloudinary(
        previousAttachment.publicId,
        previousAttachment.resourceType,
      );
    }

    void logActivity({
      req,
      action: "update",
      module: "costing",
      resourceId: cost._id,
      resourceName: cost.title,
      description: `Updated cost "${cost.title}" (${cost.amount} BDT)`,
    });

    return ApiResponse(res, 200, "Cost updated successfully", cost);
  } catch (error) {
    if (uploadedAttachment) {
      await deleteFromCloudinary(
        uploadedAttachment.publicId,
        uploadedAttachment.resourceType,
      );
    }
    throw error;
  }
});

export const deleteCost = asyncHandler(async (req: Request, res: Response) => {
  const cost = await Cost.findByIdAndDelete(req.params.id);
  if (!cost) throw new ApiError(404, "Cost not found");

  if (cost.attachment) {
    void deleteFromCloudinary(
      cost.attachment.publicId,
      cost.attachment.resourceType,
    );
  }

  void logActivity({
    req,
    action: "delete",
    module: "costing",
    resourceId: cost._id,
    resourceName: cost.title,
    description: `Deleted cost "${cost.title}" (${cost.amount} BDT)`,
  });

  return ApiResponse(res, 200, "Cost deleted successfully");
});
