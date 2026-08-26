import type { Request, Response } from "express";
import { Supplier } from "../models/supplier.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { uploadToImgbb, deleteFromImgbb } from "../utils/uploadToImgbb";
import { logActivity } from "../utils/logActivity";

export const getSuppliers = asyncHandler(
  async (req: Request, res: Response) => {
    const suppliers = await Supplier.find().sort({ sortOrder: 1, name: 1 });
    return ApiResponse(res, 200, "Suppliers fetched successfully", suppliers);
  },
);

export const getSupplier = asyncHandler(
  async (req: Request, res: Response) => {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) throw new ApiError(404, "Supplier not found");
    return ApiResponse(res, 200, "Supplier fetched successfully", supplier);
  },
);

export const createSupplier = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      name,
      contactPerson,
      email,
      phone,
      address,
      website,
      description,
      isActive,
      sortOrder,
    } = req.body;

    const logo = req.file ? await uploadToImgbb(req.file, "suppliers") : "";

    const supplier = await Supplier.create({
      name,
      contactPerson,
      email,
      phone,
      address,
      website,
      description,
      logo,
      isActive,
      sortOrder,
    });

    void logActivity({
      req,
      action: "create",
      module: "supplier",
      resourceId: supplier._id,
      resourceName: supplier.name,
      description: `Created supplier "${supplier.name}"`,
    });

    return ApiResponse(res, 201, "Supplier created successfully", supplier);
  },
);

export const updateSupplier = asyncHandler(
  async (req: Request, res: Response) => {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) throw new ApiError(404, "Supplier not found");

    const {
      name,
      contactPerson,
      email,
      phone,
      address,
      website,
      description,
      isActive,
      sortOrder,
    } = req.body;

    if (name !== undefined) supplier.name = name;
    if (contactPerson !== undefined) supplier.contactPerson = contactPerson;
    if (email !== undefined) supplier.email = email;
    if (phone !== undefined) supplier.phone = phone;
    if (address !== undefined) supplier.address = address;
    if (website !== undefined) supplier.website = website;
    if (description !== undefined) supplier.description = description;
    if (isActive !== undefined) supplier.isActive = isActive;
    if (sortOrder !== undefined) supplier.sortOrder = sortOrder;

    if (req.file) {
      const previousLogo = supplier.logo;
      supplier.logo = await uploadToImgbb(req.file, "suppliers");
      if (previousLogo) await deleteFromImgbb(previousLogo);
    }

    await supplier.save();

    void logActivity({
      req,
      action: "update",
      module: "supplier",
      resourceId: supplier._id,
      resourceName: supplier.name,
      description: `Updated supplier "${supplier.name}"`,
    });

    return ApiResponse(res, 200, "Supplier updated successfully", supplier);
  },
);

export const deleteSupplier = asyncHandler(
  async (req: Request, res: Response) => {
    const supplier = await Supplier.findByIdAndDelete(req.params.id);
    if (!supplier) throw new ApiError(404, "Supplier not found");

    if (supplier.logo) {
      await deleteFromImgbb(supplier.logo);
    }

    void logActivity({
      req,
      action: "delete",
      module: "supplier",
      resourceId: supplier._id,
      resourceName: supplier.name,
      description: `Deleted supplier "${supplier.name}"`,
    });

    return ApiResponse(res, 200, "Supplier deleted successfully");
  },
);
