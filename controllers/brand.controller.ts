import type { Request, Response } from "express";
import { Brand } from "../models/brand.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { uploadToImgbb, deleteFromImgbb } from "../utils/uploadToImgbb";
import { logActivity } from "../utils/logActivity";

export const getBrands = asyncHandler(async (req: Request, res: Response) => {
  const brands = await Brand.find().sort({ sortOrder: 1, name: 1 });
  return ApiResponse(res, 200, "Brands fetched successfully", brands);
});

export const getBrand = asyncHandler(async (req: Request, res: Response) => {
  const brand = await Brand.findById(req.params.id);
  if (!brand) throw new ApiError(404, "Brand not found");
  return ApiResponse(res, 200, "Brand fetched successfully", brand);
});

export const createBrand = asyncHandler(
  async (req: Request, res: Response) => {
    const { name, description, isActive, sortOrder } = req.body;

    const logo = req.file ? await uploadToImgbb(req.file, "brands") : "";

    const brand = await Brand.create({
      name,
      description,
      logo,
      isActive,
      sortOrder,
    });

    void logActivity({
      req,
      action: "create",
      module: "brand",
      resourceId: brand._id,
      resourceName: brand.name,
      description: `Created brand "${brand.name}"`,
    });

    return ApiResponse(res, 201, "Brand created successfully", brand);
  },
);

export const updateBrand = asyncHandler(
  async (req: Request, res: Response) => {
    const brand = await Brand.findById(req.params.id);
    if (!brand) throw new ApiError(404, "Brand not found");

    const { name, description, isActive, sortOrder } = req.body;

    if (name !== undefined) brand.name = name;
    if (description !== undefined) brand.description = description;
    if (isActive !== undefined) brand.isActive = isActive;
    if (sortOrder !== undefined) brand.sortOrder = sortOrder;

    if (req.file) {
      const previousLogo = brand.logo;
      brand.logo = await uploadToImgbb(req.file, "brands");
      if (previousLogo) await deleteFromImgbb(previousLogo);
    }

    await brand.save();

    void logActivity({
      req,
      action: "update",
      module: "brand",
      resourceId: brand._id,
      resourceName: brand.name,
      description: `Updated brand "${brand.name}"`,
    });

    return ApiResponse(res, 200, "Brand updated successfully", brand);
  },
);

export const deleteBrand = asyncHandler(
  async (req: Request, res: Response) => {
    const brand = await Brand.findByIdAndDelete(req.params.id);
    if (!brand) throw new ApiError(404, "Brand not found");

    if (brand.logo) {
      await deleteFromImgbb(brand.logo);
    }

    void logActivity({
      req,
      action: "delete",
      module: "brand",
      resourceId: brand._id,
      resourceName: brand.name,
      description: `Deleted brand "${brand.name}"`,
    });

    return ApiResponse(res, 200, "Brand deleted successfully");
  },
);
