import type { Request, Response } from "express";
import { Brand } from "../models/brand.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { uploadToSpaces, deleteFromSpaces } from "../utils/uploadToSpaces";
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

    const uploaded = req.file
      ? await uploadToSpaces(req.file, "brands")
      : null;

    let brand;
    try {
      brand = await Brand.create({
        name,
        description,
        logo: uploaded?.url || "",
        logoKey: uploaded?.key || "",
        isActive,
        sortOrder,
      });
    } catch (err) {
      if (uploaded) await deleteFromSpaces(uploaded.key);
      throw err;
    }

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

    // Deletion of the old logo is deferred until after `save()` succeeds, so
    // a validation failure never destroys the still-live old logo, and a
    // newly uploaded replacement is rolled back instead of left orphaned.
    let previousLogoKey: string | null = null;
    let newlyUploadedKey: string | null = null;

    if (req.file) {
      const uploaded = await uploadToSpaces(req.file, "brands");
      newlyUploadedKey = uploaded.key;
      if (brand.logoKey) previousLogoKey = brand.logoKey;
      brand.logo = uploaded.url;
      brand.logoKey = uploaded.key;
    }

    try {
      await brand.save();
    } catch (err) {
      if (newlyUploadedKey) await deleteFromSpaces(newlyUploadedKey);
      throw err;
    }

    if (previousLogoKey) await deleteFromSpaces(previousLogoKey);

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

    if (brand.logoKey) {
      await deleteFromSpaces(brand.logoKey);
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
