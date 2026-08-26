import type { Request, Response } from "express";
import mongoose from "mongoose";
import { Order } from "../models/order.model";
import { Product } from "../models/product.model";
import {
  Review,
  REVIEW_STATUSES,
  type IReviewAttachment,
  type ReviewStatus,
} from "../models/review.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { deleteFromImgbb, uploadToImgbb } from "../utils/uploadToImgbb";
import { logActivity } from "../utils/logActivity";

const parsePagination = (req: Request, defaultLimit = 10) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(
    50,
    Math.max(1, parseInt(String(req.query.limit ?? defaultLimit), 10) || defaultLimit)
  );
  return { page, limit, skip: (page - 1) * limit };
};

const orderIdentifier = (value: string) =>
  mongoose.Types.ObjectId.isValid(value)
    ? { _id: value }
    : { orderNumber: value };

export const submitReview = asyncHandler(
  async (req: Request, res: Response) => {
    const { orderId, productId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw new ApiError(400, "Invalid product id");
    }

    const order = await Order.findOne({
      ...orderIdentifier(orderId),
      customer: req.user!._id,
    });

    if (!order) throw new ApiError(404, "Order not found");
    if (order.orderStatus !== "delivered" || order.paymentStatus !== "paid") {
      throw new ApiError(
        422,
        "Reviews are available only after the order is delivered and paid"
      );
    }

    const purchasedItem = order.items.find(
      (item) => String(item.product) === productId
    );
    if (!purchasedItem) {
      throw new ApiError(403, "This product was not purchased in this order");
    }

    const existingReview = await Review.findOne({
      order: order._id,
      product: productId,
    });
    if (existingReview) {
      throw new ApiError(409, "You have already reviewed this product from this order");
    }

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const uploadedAttachments: IReviewAttachment[] = [];

    try {
      for (const file of files) {
        const url = await uploadToImgbb(file, `reviews/${req.user!._id}`);
        uploadedAttachments.push({
          url,
          name: file.originalname,
          type: file.mimetype === "application/pdf" ? "pdf" : "image",
        });
      }

      const review = new Review({
        order: order._id,
        product: productId,
        customer: req.user!._id,
      });

      review.rating = Number(req.body.rating);
      review.comment = req.body.comment;
      review.attachments = uploadedAttachments;
      await review.save();

      return ApiResponse(
        res,
        201,
        "Review submitted and sent for approval",
        review
      );
    } catch (error) {
      await Promise.allSettled(
        uploadedAttachments.map(({ url }) => deleteFromImgbb(url))
      );
      throw error;
    }
  }
);

export const getMyOrderReviews = asyncHandler(
  async (req: Request, res: Response) => {
    const order = await Order.findOne({
      ...orderIdentifier(req.params.orderId),
      customer: req.user!._id,
    }).select("_id");

    if (!order) throw new ApiError(404, "Order not found");

    const reviews = await Review.find({
      order: order._id,
      customer: req.user!._id,
    })
      .populate("product", "title slug sku featureImage")
      .sort({ createdAt: 1 });

    return ApiResponse(res, 200, "Order reviews fetched successfully", reviews);
  }
);

export const getProductReviews = asyncHandler(
  async (req: Request, res: Response) => {
    const { productId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw new ApiError(400, "Invalid product id");
    }
    if (!(await Product.exists({ _id: productId }))) {
      throw new ApiError(404, "Product not found");
    }

    const { page, limit, skip } = parsePagination(req);
    const filter = { product: productId, status: "approved" as const };
    const [reviews, total, ratingSummary] = await Promise.all([
      Review.find(filter)
        .select("rating comment attachments customer createdAt updatedAt")
        .populate("customer", "firstName lastName avatar")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments(filter),
      Review.aggregate<{ _id: null; averageRating: number; count: number }>([
        { $match: { product: new mongoose.Types.ObjectId(productId), status: "approved" } },
        { $group: { _id: null, averageRating: { $avg: "$rating" }, count: { $sum: 1 } } },
      ]),
    ]);

    const summary = ratingSummary[0];
    return ApiResponse(res, 200, "Product reviews fetched successfully", {
      reviews,
      summary: {
        averageRating: summary ? Number(summary.averageRating.toFixed(1)) : 0,
        totalReviews: summary?.count ?? 0,
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

export const getReviewsForModeration = asyncHandler(
  async (req: Request, res: Response) => {
    const requestedStatus = String(req.query.status ?? "all");
    if (
      requestedStatus !== "all" &&
      !REVIEW_STATUSES.includes(requestedStatus as ReviewStatus)
    ) {
      throw new ApiError(400, "Invalid review status");
    }

    const { page, limit, skip } = parsePagination(req, 20);
    const filter: { status?: ReviewStatus } = {};
    if (requestedStatus !== "all") {
      filter.status = requestedStatus as ReviewStatus;
    }
    const [reviews, total, statusSummary, ratingSummary] = await Promise.all([
      Review.find(filter)
        .populate("customer", "firstName lastName email phone avatar")
        .populate("product", "title slug sku featureImage")
        .populate("order", "orderNumber")
        .populate("moderatedBy", "firstName lastName role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments(filter),
      Review.aggregate<{ _id: ReviewStatus; count: number }>([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Review.aggregate<{ _id: null; averageRating: number }>([
        { $group: { _id: null, averageRating: { $avg: "$rating" } } },
      ]),
    ]);

    const statusCounts = { pending: 0, approved: 0, rejected: 0 };
    statusSummary.forEach(({ _id, count }) => {
      statusCounts[_id] = count;
    });

    return ApiResponse(res, 200, "Reviews fetched successfully", {
      reviews,
      summary: {
        total: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
        statusCounts,
        averageRating: ratingSummary[0]
          ? Number(ratingSummary[0].averageRating.toFixed(1))
          : 0,
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

export const moderateReview = asyncHandler(
  async (req: Request, res: Response) => {
    const review = await Review.findById(req.params.id);
    if (!review) throw new ApiError(404, "Review not found");

    review.status = req.body.status;
    review.moderationNote = req.body.moderationNote ?? "";
    review.moderatedBy = req.user!._id as mongoose.Types.ObjectId;
    review.moderatedAt = new Date();
    await review.save();

    void logActivity({
      req,
      action: "update",
      module: "review",
      resourceId: review._id,
      description: `Marked a review as "${review.status}"`,
    });

    return ApiResponse(res, 200, `Review ${review.status} successfully`, review);
  }
);
