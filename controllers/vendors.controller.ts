import type { Request, Response } from "express";
import { Vendor, type IVendorDocument } from "../models/vendors.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { deleteFromSpaces, uploadToSpaces } from "../utils/uploadToSpaces";
import { logActivity } from "../utils/logActivity";
import { generateVendorToken } from "../utils/generateToken";

type UploadedFiles = { [fieldname: string]: Express.Multer.File[] };

const MAX_BUSINESS_DOCUMENTS = 5;

const documentFromFile = async (
  file: Express.Multer.File,
  subfolder: string,
): Promise<IVendorDocument> => {
  const uploaded = await uploadToSpaces(file, subfolder);
  return {
    url: uploaded.url,
    key: uploaded.key,
    name: uploaded.name,
    size: uploaded.size,
  };
};

const parseJsonArray = (value: unknown): unknown[] => {
  if (value === undefined || value === "") return [];
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const getVendors = asyncHandler(async (req: Request, res: Response) => {
  const vendors = await Vendor.find().sort({ name: 1 });
  return ApiResponse(res, 200, "Vendors fetched successfully", vendors);
});

export const getVendor = asyncHandler(async (req: Request, res: Response) => {
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) throw new ApiError(404, "Vendor not found");
  return ApiResponse(res, 200, "Vendor fetched successfully", vendor);
});

// Public login for the separate vendor-facing dashboard — not the admin
// dashboard's staff auth. "inactive"/"disabled" vendors are blocked; "active"
// and "pending" (still onboarding, e.g. finishing documents) can sign in.
export const vendorSignin = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, password } = req.body;

    const vendor = await Vendor.findOne({
      email: String(email).trim().toLowerCase(),
    }).select("+password");
    if (!vendor) throw new ApiError(401, "Invalid credentials");

    const isMatch = await vendor.comparePassword(password);
    if (!isMatch) throw new ApiError(401, "Invalid credentials");

    if (vendor.status === "inactive" || vendor.status === "disabled") {
      throw new ApiError(
        403,
        "Your vendor account is not active. Please contact support.",
      );
    }

    const token = generateVendorToken(String(vendor._id));

    return ApiResponse(res, 200, "Vendor signin successful", {
      vendor,
      token,
    });
  },
);

export const createVendor = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      name,
      contactPerson,
      email,
      phone,
      address,
      website,
      socialLink,
      password,
      description,
      status,
      level,
      ownership,
      commissionRate,
      commissionNotes,
    } = req.body;

    const categories = parseJsonArray(req.body.categories) as string[];
    const categoryCommissions = parseJsonArray(
      req.body.categoryCommissions,
    ) as { category: string; rate: number }[];

    const files = req.files as UploadedFiles | undefined;
    const logoFile = files?.logo?.[0];
    const coverImageFile = files?.coverImage?.[0];
    const agreementFile = files?.agreementDocument?.[0];
    const businessDocFiles = files?.businessDocuments || [];

    if (businessDocFiles.length > MAX_BUSINESS_DOCUMENTS) {
      throw new ApiError(
        422,
        `A vendor can have at most ${MAX_BUSINESS_DOCUMENTS} business documents`,
      );
    }

    const uploadedKeys: string[] = [];
    let vendor;
    try {
      const logo = logoFile
        ? await documentFromFile(logoFile, "vendors/logo")
        : undefined;
      if (logo) uploadedKeys.push(logo.key);

      const coverImage = coverImageFile
        ? await documentFromFile(coverImageFile, "vendors/cover")
        : undefined;
      if (coverImage) uploadedKeys.push(coverImage.key);

      const agreementDocument = agreementFile
        ? await documentFromFile(agreementFile, "vendors/agreements")
        : undefined;
      if (agreementDocument) uploadedKeys.push(agreementDocument.key);

      const businessDocuments = await Promise.all(
        businessDocFiles.map((file) =>
          documentFromFile(file, "vendors/documents"),
        ),
      );
      uploadedKeys.push(...businessDocuments.map((doc) => doc.key));

      vendor = await Vendor.create({
        name,
        contactPerson,
        email,
        phone,
        address,
        website,
        socialLink,
        password: password || undefined,
        description,
        status,
        level,
        ownership,
        categories,
        commissionRate,
        categoryCommissions,
        commissionNotes,
        logo,
        coverImage,
        agreementDocument,
        businessDocuments,
      });
    } catch (err) {
      // Files already landed in Spaces before this point — don't leave them
      // orphaned if the document itself fails to save.
      await Promise.all(uploadedKeys.map((key) => deleteFromSpaces(key)));
      throw err;
    }

    void logActivity({
      req,
      action: "create",
      module: "vendor",
      resourceId: vendor._id,
      resourceName: vendor.name,
      description: `Created vendor "${vendor.name}"`,
    });

    return ApiResponse(res, 201, "Vendor created successfully", vendor);
  },
);

export const updateVendor = asyncHandler(
  async (req: Request, res: Response) => {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) throw new ApiError(404, "Vendor not found");

    const {
      name,
      contactPerson,
      email,
      phone,
      address,
      website,
      socialLink,
      password,
      description,
      status,
      level,
      ownership,
      commissionRate,
      commissionNotes,
    } = req.body;

    if (name !== undefined) vendor.name = name;
    if (contactPerson !== undefined) vendor.contactPerson = contactPerson;
    if (email !== undefined) vendor.email = email;
    if (phone !== undefined) vendor.phone = phone;
    if (address !== undefined) vendor.address = address;
    if (website !== undefined) vendor.website = website;
    if (socialLink !== undefined) vendor.socialLink = socialLink;
    if (password) vendor.password = password;
    if (description !== undefined) vendor.description = description;
    if (status !== undefined) vendor.status = status;
    if (level !== undefined) vendor.level = level;
    if (ownership !== undefined) vendor.ownership = ownership;
    if (commissionRate !== undefined) vendor.commissionRate = commissionRate;
    if (commissionNotes !== undefined) vendor.commissionNotes = commissionNotes;
    if (req.body.categories !== undefined) {
      vendor.categories = parseJsonArray(req.body.categories) as string[];
    }
    if (req.body.categoryCommissions !== undefined) {
      vendor.categoryCommissions = parseJsonArray(
        req.body.categoryCommissions,
      ) as { category: string; rate: number }[];
    }

    const files = req.files as UploadedFiles | undefined;
    const logoFile = files?.logo?.[0];
    const coverImageFile = files?.coverImage?.[0];
    const agreementFile = files?.agreementDocument?.[0];
    const businessDocFiles = files?.businessDocuments || [];

    if (
      vendor.businessDocuments.length + businessDocFiles.length >
      MAX_BUSINESS_DOCUMENTS
    ) {
      throw new ApiError(
        422,
        `A vendor can have at most ${MAX_BUSINESS_DOCUMENTS} business documents`,
      );
    }

    // Deletions from Spaces are deferred until after `save()` succeeds, so a
    // validation failure never destroys the still-live old files, and newly
    // uploaded replacements are rolled back instead of left orphaned.
    const newlyUploadedKeys: string[] = [];
    const keysToDeleteOnSuccess: string[] = [];

    try {
      if (logoFile) {
        const previous = vendor.logo;
        const uploaded = await documentFromFile(logoFile, "vendors/logo");
        newlyUploadedKeys.push(uploaded.key);
        vendor.logo = uploaded;
        if (previous) keysToDeleteOnSuccess.push(previous.key);
      }

      if (coverImageFile) {
        const previous = vendor.coverImage;
        const uploaded = await documentFromFile(
          coverImageFile,
          "vendors/cover",
        );
        newlyUploadedKeys.push(uploaded.key);
        vendor.coverImage = uploaded;
        if (previous) keysToDeleteOnSuccess.push(previous.key);
      }

      if (agreementFile) {
        const previous = vendor.agreementDocument;
        const uploaded = await documentFromFile(
          agreementFile,
          "vendors/agreements",
        );
        newlyUploadedKeys.push(uploaded.key);
        vendor.agreementDocument = uploaded;
        if (previous) keysToDeleteOnSuccess.push(previous.key);
      }

      if (businessDocFiles.length > 0) {
        const uploaded = await Promise.all(
          businessDocFiles.map((file) =>
            documentFromFile(file, "vendors/documents"),
          ),
        );
        newlyUploadedKeys.push(...uploaded.map((doc) => doc.key));
        vendor.businessDocuments = [...vendor.businessDocuments, ...uploaded];
      }

      await vendor.save();
    } catch (err) {
      await Promise.all(newlyUploadedKeys.map((key) => deleteFromSpaces(key)));
      throw err;
    }

    await Promise.all(keysToDeleteOnSuccess.map((key) => deleteFromSpaces(key)));

    void logActivity({
      req,
      action: "update",
      module: "vendor",
      resourceId: vendor._id,
      resourceName: vendor.name,
      description: `Updated vendor "${vendor.name}"`,
    });

    return ApiResponse(res, 200, "Vendor updated successfully", vendor);
  },
);

export const deleteVendor = asyncHandler(
  async (req: Request, res: Response) => {
    const vendor = await Vendor.findByIdAndDelete(req.params.id);
    if (!vendor) throw new ApiError(404, "Vendor not found");

    const keysToDelete = [
      vendor.logo?.key,
      vendor.coverImage?.key,
      vendor.agreementDocument?.key,
      ...vendor.businessDocuments.map((doc) => doc.key),
    ].filter((key): key is string => Boolean(key));
    await Promise.all(keysToDelete.map((key) => deleteFromSpaces(key)));

    void logActivity({
      req,
      action: "delete",
      module: "vendor",
      resourceId: vendor._id,
      resourceName: vendor.name,
      description: `Deleted vendor "${vendor.name}"`,
    });

    return ApiResponse(res, 200, "Vendor deleted successfully");
  },
);
