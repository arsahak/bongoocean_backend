import type { Request, Response } from "express";
import { Category } from "../models/category.model";
import { Product } from "../models/product.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { uploadToImgbb, deleteFromImgbb } from "../utils/uploadToImgbb";
import { logActivity } from "../utils/logActivity";

export const getCategories = asyncHandler(
  async (req: Request, res: Response) => {
    const [categories, productCounts] = await Promise.all([
      Category.find().sort({ sortOrder: 1, name: 1 }).lean(),
      Product.aggregate<{ _id: unknown; productCount: number }>([
        { $match: { isActive: true } },
        { $group: { _id: "$category", productCount: { $sum: 1 } } },
      ]),
    ]);
    const countsByCategory = new Map(
      productCounts.map(({ _id, productCount }) => [String(_id), productCount]),
    );
    const categoriesWithCounts = categories.map((category) => ({
      ...category,
      productCount: countsByCategory.get(String(category._id)) ?? 0,
    }));

    return ApiResponse(
      res,
      200,
      "Categories fetched successfully",
      categoriesWithCounts,
    );
  },
);

export const getCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw new ApiError(404, "Category not found");
  return ApiResponse(res, 200, "Category fetched successfully", category);
});

export const createCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const { name, description, parent, isActive, sortOrder } = req.body;

    if (parent) {
      const parentExists = await Category.exists({ _id: parent });
      if (!parentExists) throw new ApiError(422, "Parent category not found");
    }

    const image = req.file ? await uploadToImgbb(req.file, "categories") : "";

    const category = await Category.create({
      name,
      description,
      image,
      parent: parent || null,
      isActive,
      sortOrder,
    });

    void logActivity({
      req,
      action: "create",
      module: "category",
      resourceId: category._id,
      resourceName: category.name,
      description: `Created category "${category.name}"`,
    });

    return ApiResponse(res, 201, "Category created successfully", category);
  },
);

export const updateCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const category = await Category.findById(req.params.id);
    if (!category) throw new ApiError(404, "Category not found");

    const { name, description, parent, isActive, sortOrder } = req.body;

    if (parent) {
      if (parent === req.params.id) {
        throw new ApiError(422, "A category cannot be its own parent");
      }
      const parentExists = await Category.exists({ _id: parent });
      if (!parentExists) throw new ApiError(422, "Parent category not found");
    }

    if (name !== undefined) category.name = name;
    if (description !== undefined) category.description = description;
    if (parent !== undefined) category.parent = parent || null;
    if (isActive !== undefined) category.isActive = isActive;
    if (sortOrder !== undefined) category.sortOrder = sortOrder;

    if (req.file) {
      const previousImage = category.image;
      category.image = await uploadToImgbb(req.file, "categories");
      if (previousImage) await deleteFromImgbb(previousImage);
    }

    await category.save();

    void logActivity({
      req,
      action: "update",
      module: "category",
      resourceId: category._id,
      resourceName: category.name,
      description: `Updated category "${category.name}"`,
    });

    return ApiResponse(res, 200, "Category updated successfully", category);
  },
);

export const deleteCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const hasChildren = await Category.exists({ parent: req.params.id });
    if (hasChildren) {
      throw new ApiError(
        409,
        "Cannot delete a category that has subcategories",
      );
    }

    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) throw new ApiError(404, "Category not found");

    if (category.image) {
      await deleteFromImgbb(category.image);
    }

    void logActivity({
      req,
      action: "delete",
      module: "category",
      resourceId: category._id,
      resourceName: category.name,
      description: `Deleted category "${category.name}"`,
    });

    return ApiResponse(res, 200, "Category deleted successfully");
  },
);
