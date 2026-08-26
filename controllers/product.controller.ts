import type { Request, Response } from "express";
import mongoose from "mongoose";
import { Product } from "../models/product.model";
import { Category } from "../models/category.model";
import { Brand } from "../models/brand.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { uploadToImgbb, deleteFromImgbb } from "../utils/uploadToImgbb";
import { logActivity } from "../utils/logActivity";

type UploadedFiles = { [fieldname: string]: Express.Multer.File[] };

const SKU_PREFIX = "FMA-WC-";

export const getNextSku = asyncHandler(async (req: Request, res: Response) => {
  const pattern = new RegExp(`^${SKU_PREFIX}(\\d+)$`, "i");
  const products = await Product.find(
    { sku: { $regex: pattern } },
    { sku: 1 },
  ).lean();

  const maxNumber = products.reduce((max, p) => {
    const match = p.sku.match(pattern);
    const num = match ? parseInt(match[1], 10) : 0;
    return Math.max(max, num);
  }, 0);

  return ApiResponse(res, 200, "Next SKU generated", {
    sku: `${SKU_PREFIX}${maxNumber + 1}`,
  });
});

export const getProducts = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20),
  );
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (req.query.category) {
    const category = String(req.query.category);
    if (!mongoose.Types.ObjectId.isValid(category)) {
      throw new ApiError(422, "Invalid product category");
    }
    filter.category = category;
  }
  if (req.query.isActive !== undefined) {
    filter.isActive = req.query.isActive === "true";
  }
  if (req.query.isFeatured !== undefined) {
    filter.isFeatured = req.query.isFeatured === "true";
  }
  if (req.query.search) {
    const escapedSearch = String(req.query.search)
      .trim()
      .slice(0, 100)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (escapedSearch) {
      const searchPattern = { $regex: escapedSearch, $options: "i" };
      filter.$or = [
        { title: searchPattern },
        { sku: searchPattern },
        { shortDescription: searchPattern },
      ];
    }
  }

  const sortOptions: Record<string, Record<string, 1 | -1>> = {
    default: { sortOrder: 1, createdAt: -1 },
    "price-low": { price: 1, sortOrder: 1 },
    "price-high": { price: -1, sortOrder: 1 },
    name: { title: 1, sortOrder: 1 },
  };
  const sort =
    sortOptions[String(req.query.sort || "default")] || sortOptions.default;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate("category", "name slug")
      .populate("brand", "name slug")
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Product.countDocuments(filter),
  ]);

  return ApiResponse(res, 200, "Products fetched successfully", {
    products,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const query = mongoose.Types.ObjectId.isValid(id)
    ? { _id: id }
    : { slug: id };

  const product = await Product.findOne(query)
    .populate("category", "name slug")
    .populate("brand", "name slug");
  if (!product) throw new ApiError(404, "Product not found");
  return ApiResponse(res, 200, "Product fetched successfully", product);
});

export const createProduct = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      title,
      sku,
      category,
      brand,
      shortDescription,
      overview,
      price,
      discountPrice,
      unit,
      weight,
      stock,
      isActive,
      isFeatured,
      sortOrder,
    } = req.body;

    const categoryExists = await Category.exists({ _id: category });
    if (!categoryExists) throw new ApiError(422, "Category not found");

    if (brand) {
      const brandExists = await Brand.exists({ _id: brand });
      if (!brandExists) throw new ApiError(422, "Brand not found");
    }

    const files = req.files as UploadedFiles | undefined;
    const featureImageFile = files?.featureImage?.[0];
    const galleryFiles = files?.galleryImages || [];

    if (galleryFiles.length > 6) {
      throw new ApiError(422, "A product can have at most 6 gallery images");
    }

    const featureImage = featureImageFile
      ? await uploadToImgbb(featureImageFile, "products")
      : "";
    const galleryImages = await Promise.all(
      galleryFiles.map((file) => uploadToImgbb(file, "products/gallery")),
    );

    let product;
    try {
      product = await Product.create({
        title,
        sku,
        category,
        brand: brand || null,
        shortDescription,
        overview,
        featureImage,
        galleryImages,
        price,
        discountPrice,
        unit,
        weight,
        stock,
        isActive,
        isFeatured,
        sortOrder,
      });
    } catch (err) {
      // Images already landed in Spaces before this point — don't leave them
      // orphaned if the document itself fails to save.
      const uploaded = [featureImage, ...galleryImages].filter(Boolean);
      await Promise.all(uploaded.map((url) => deleteFromImgbb(url)));
      throw err;
    }

    void logActivity({
      req,
      action: "create",
      module: "product",
      resourceId: product._id,
      resourceName: product.title,
      description: `Created product "${product.title}"`,
    });

    return ApiResponse(res, 201, "Product created successfully", product);
  },
);

export const updateProduct = asyncHandler(
  async (req: Request, res: Response) => {
    const product = await Product.findById(req.params.id);
    if (!product) throw new ApiError(404, "Product not found");

    const {
      title,
      sku,
      category,
      brand,
      shortDescription,
      overview,
      price,
      discountPrice,
      unit,
      weight,
      stock,
      isActive,
      isFeatured,
      sortOrder,
      removeFeatureImage,
      keepGalleryImages,
    } = req.body;

    if (category) {
      const categoryExists = await Category.exists({ _id: category });
      if (!categoryExists) throw new ApiError(422, "Category not found");
      product.category = category;
    }

    if (brand !== undefined) {
      if (brand) {
        const brandExists = await Brand.exists({ _id: brand });
        if (!brandExists) throw new ApiError(422, "Brand not found");
        product.brand = brand;
      } else {
        product.brand = null;
      }
    }

    if (title !== undefined) product.title = title;
    if (sku !== undefined) product.sku = sku;
    if (shortDescription !== undefined)
      product.shortDescription = shortDescription;
    if (overview !== undefined) product.overview = overview;
    if (price !== undefined) product.price = price;
    if (discountPrice !== undefined) product.discountPrice = discountPrice;
    if (unit !== undefined) product.unit = unit;
    if (weight !== undefined) product.weight = weight;
    if (stock !== undefined) product.stock = stock;
    if (isActive !== undefined) product.isActive = isActive;
    if (isFeatured !== undefined) product.isFeatured = isFeatured;
    if (sortOrder !== undefined) product.sortOrder = sortOrder;

    const files = req.files as UploadedFiles | undefined;
    const featureImageFile = files?.featureImage?.[0];
    const galleryFiles = files?.galleryImages || [];

    // Deletions from Spaces are deferred until after `save()` succeeds, so a
    // validation failure never destroys the still-live old images, and newly
    // uploaded replacements are rolled back instead of left orphaned.
    const newlyUploadedUrls: string[] = [];
    const urlsToDeleteOnSuccess: string[] = [];

    if (featureImageFile) {
      const previousImage = product.featureImage;
      const uploaded = await uploadToImgbb(featureImageFile, "products");
      newlyUploadedUrls.push(uploaded);
      product.featureImage = uploaded;
      if (previousImage) urlsToDeleteOnSuccess.push(previousImage);
    } else if (removeFeatureImage === "true" || removeFeatureImage === true) {
      const previousImage = product.featureImage;
      product.featureImage = "";
      if (previousImage) urlsToDeleteOnSuccess.push(previousImage);
    }

    if (galleryFiles.length > 0 || keepGalleryImages !== undefined) {
      let keptUrls = product.galleryImages;
      if (keepGalleryImages !== undefined) {
        try {
          const parsed = JSON.parse(keepGalleryImages);
          keptUrls = Array.isArray(parsed)
            ? parsed.filter((url) => product.galleryImages.includes(url))
            : [];
        } catch {
          keptUrls = product.galleryImages;
        }
      }

      if (keptUrls.length + galleryFiles.length > 6) {
        await Promise.all(
          newlyUploadedUrls.map((url) => deleteFromImgbb(url)),
        );
        throw new ApiError(422, "A product can have at most 6 gallery images");
      }

      const newlyUploaded = await Promise.all(
        galleryFiles.map((file) => uploadToImgbb(file, "products/gallery")),
      );
      newlyUploadedUrls.push(...newlyUploaded);

      const previousGallery = product.galleryImages;
      product.galleryImages = [...keptUrls, ...newlyUploaded];

      const removedUrls = previousGallery.filter(
        (url) => !keptUrls.includes(url),
      );
      urlsToDeleteOnSuccess.push(...removedUrls);
    }

    try {
      await product.save();
    } catch (err) {
      await Promise.all(newlyUploadedUrls.map((url) => deleteFromImgbb(url)));
      throw err;
    }

    await Promise.all(
      urlsToDeleteOnSuccess.map((url) => deleteFromImgbb(url)),
    );

    void logActivity({
      req,
      action: "update",
      module: "product",
      resourceId: product._id,
      resourceName: product.title,
      description: `Updated product "${product.title}"`,
    });

    return ApiResponse(res, 200, "Product updated successfully", product);
  },
);

export const deleteProduct = asyncHandler(
  async (req: Request, res: Response) => {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) throw new ApiError(404, "Product not found");

    const deletions = [deleteFromImgbb(product.featureImage)];
    product.galleryImages.forEach((url) =>
      deletions.push(deleteFromImgbb(url)),
    );
    await Promise.all(deletions);

    void logActivity({
      req,
      action: "delete",
      module: "product",
      resourceId: product._id,
      resourceName: product.title,
      description: `Deleted product "${product.title}"`,
    });

    return ApiResponse(res, 200, "Product deleted successfully");
  },
);
