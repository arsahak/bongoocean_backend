import type { Request, Response } from "express";
import mongoose from "mongoose";
import { Product, expireStaleNewArrivals } from "../models/product.model";
import { Category } from "../models/category.model";
import { Brand } from "../models/brand.model";
import { Vendor } from "../models/vendors.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { uploadToSpaces, deleteFromSpaces } from "../utils/uploadToSpaces";
import { extractYoutubeId, youtubeEmbedUrl } from "../utils/youtube";
import { logActivity } from "../utils/logActivity";

type UploadedFiles = { [fieldname: string]: Express.Multer.File[] };

interface ProductVideoFields {
  videoUrl: string;
  videoSource: "" | "upload" | "youtube";
  videoKey: string;
}

const NO_VIDEO: ProductVideoFields = {
  videoUrl: "",
  videoSource: "",
  videoKey: "",
};

const buildVideoFromUpload = async (
  file: Express.Multer.File,
): Promise<ProductVideoFields> => {
  const uploaded = await uploadToSpaces(file, "products/video");
  return { videoUrl: uploaded.url, videoSource: "upload", videoKey: uploaded.key };
};

const buildVideoFromYoutube = (url: string): ProductVideoFields => {
  const id = extractYoutubeId(url);
  if (!id) throw new ApiError(422, "Invalid YouTube URL");
  return { videoUrl: youtubeEmbedUrl(id), videoSource: "youtube", videoKey: "" };
};

const SKU_PREFIX = "BOO-OW-";

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
  await expireStaleNewArrivals();

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
  if (req.query.vendor) {
    const vendor = String(req.query.vendor);
    if (!mongoose.Types.ObjectId.isValid(vendor)) {
      throw new ApiError(422, "Invalid vendor");
    }
    filter.vendor = vendor;
  }
  if (req.query.isActive !== undefined) {
    filter.isActive = req.query.isActive === "true";
  }
  if (req.query.isFeatured !== undefined) {
    filter.isFeatured = req.query.isFeatured === "true";
  }
  if (req.query.isTrending !== undefined) {
    filter.isTrending = req.query.isTrending === "true";
  }
  if (req.query.isNewArrival !== undefined) {
    filter.isNewArrival = req.query.isNewArrival === "true";
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
      .populate("vendor", "name slug")
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
  await expireStaleNewArrivals();

  const { id } = req.params;
  const query = mongoose.Types.ObjectId.isValid(id)
    ? { _id: id }
    : { slug: id };

  const product = await Product.findOne(query)
    .populate("category", "name slug")
    .populate("brand", "name slug")
    .populate("vendor", "name slug");
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
      vendor,
      shortDescription,
      overview,
      price,
      discountPrice,
      unit,
      weight,
      stock,
      isActive,
      isFeatured,
      isTrending,
      isNewArrival,
      videoSource,
      videoUrl,
      sortOrder,
    } = req.body;

    const categoryExists = await Category.exists({ _id: category });
    if (!categoryExists) throw new ApiError(422, "Category not found");

    if (brand) {
      const brandExists = await Brand.exists({ _id: brand });
      if (!brandExists) throw new ApiError(422, "Brand not found");
    }

    if (vendor) {
      const vendorExists = await Vendor.exists({ _id: vendor });
      if (!vendorExists) throw new ApiError(422, "Vendor not found");
    }

    const files = req.files as UploadedFiles | undefined;
    const featureImageFile = files?.featureImage?.[0];
    const galleryFiles = files?.galleryImages || [];
    const videoFile = files?.video?.[0];

    if (galleryFiles.length > 6) {
      throw new ApiError(422, "A product can have at most 6 gallery images");
    }

    const featureImageUpload = featureImageFile
      ? await uploadToSpaces(featureImageFile, "products")
      : null;
    const galleryUploads = await Promise.all(
      galleryFiles.map((file) => uploadToSpaces(file, "products/gallery")),
    );

    const video = videoFile
      ? await buildVideoFromUpload(videoFile)
      : videoSource === "youtube" && videoUrl
        ? buildVideoFromYoutube(String(videoUrl))
        : NO_VIDEO;

    let product;
    try {
      product = await Product.create({
        title,
        sku,
        category,
        brand: brand || null,
        vendor: vendor || null,
        shortDescription,
        overview,
        featureImage: featureImageUpload?.url || "",
        featureImageKey: featureImageUpload?.key || "",
        galleryImages: galleryUploads.map((u) => u.url),
        galleryImageKeys: galleryUploads.map((u) => u.key),
        ...video,
        price,
        discountPrice,
        unit,
        weight,
        stock,
        isActive,
        isFeatured,
        isTrending,
        isNewArrival,
        sortOrder,
      });
    } catch (err) {
      // Images/video already landed in storage before this point — don't
      // leave them orphaned if the document itself fails to save.
      const uploadedKeys = [
        featureImageUpload?.key,
        ...galleryUploads.map((u) => u.key),
      ].filter((key): key is string => Boolean(key));
      await Promise.all(uploadedKeys.map((key) => deleteFromSpaces(key)));
      if (video.videoSource === "upload") await deleteFromSpaces(video.videoKey);
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
      vendor,
      shortDescription,
      overview,
      price,
      discountPrice,
      unit,
      weight,
      stock,
      isActive,
      isFeatured,
      isTrending,
      isNewArrival,
      videoSource,
      videoUrl,
      removeVideo,
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

    if (vendor !== undefined) {
      if (vendor) {
        const vendorExists = await Vendor.exists({ _id: vendor });
        if (!vendorExists) throw new ApiError(422, "Vendor not found");
        product.vendor = vendor;
      } else {
        product.vendor = null;
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
    if (isTrending !== undefined) product.isTrending = isTrending;
    // Only assign when it actually flips — Mongoose marks a path "modified"
    // on any direct assignment even to an unchanged value, which would
    // otherwise reset the 30-day new-arrival window on every unrelated edit.
    if (isNewArrival !== undefined && isNewArrival !== product.isNewArrival) {
      product.isNewArrival = isNewArrival;
    }
    if (sortOrder !== undefined) product.sortOrder = sortOrder;

    const files = req.files as UploadedFiles | undefined;
    const featureImageFile = files?.featureImage?.[0];
    const galleryFiles = files?.galleryImages || [];
    const videoFile = files?.video?.[0];

    // Deletions are deferred until after `save()` succeeds, so a validation
    // failure never destroys the still-live old images/video, and newly
    // uploaded replacements are rolled back instead of left orphaned.
    const newlyUploadedKeys: string[] = [];
    const keysToDeleteOnSuccess: string[] = [];
    let newlyUploadedVideoKey: string | null = null;
    let videoKeyToDeleteOnSuccess: string | null = null;

    if (featureImageFile) {
      const previousKey = product.featureImageKey;
      const uploaded = await uploadToSpaces(featureImageFile, "products");
      newlyUploadedKeys.push(uploaded.key);
      product.featureImage = uploaded.url;
      product.featureImageKey = uploaded.key;
      if (previousKey) keysToDeleteOnSuccess.push(previousKey);
    } else if (removeFeatureImage === "true" || removeFeatureImage === true) {
      const previousKey = product.featureImageKey;
      product.featureImage = "";
      product.featureImageKey = "";
      if (previousKey) keysToDeleteOnSuccess.push(previousKey);
    }

    if (galleryFiles.length > 0 || keepGalleryImages !== undefined) {
      const previousGalleryImages = product.galleryImages;
      const previousGalleryKeys = product.galleryImageKeys;
      const previousKeyByUrl = new Map(
        previousGalleryImages.map((url, i) => [url, previousGalleryKeys[i]]),
      );

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
          newlyUploadedKeys.map((key) => deleteFromSpaces(key)),
        );
        throw new ApiError(422, "A product can have at most 6 gallery images");
      }

      const newlyUploaded = await Promise.all(
        galleryFiles.map((file) => uploadToSpaces(file, "products/gallery")),
      );
      newlyUploadedKeys.push(...newlyUploaded.map((u) => u.key));

      const keptKeys = keptUrls.map((url) => previousKeyByUrl.get(url) || "");

      product.galleryImages = [...keptUrls, ...newlyUploaded.map((u) => u.url)];
      product.galleryImageKeys = [...keptKeys, ...newlyUploaded.map((u) => u.key)];

      const removedUrls = previousGalleryImages.filter(
        (url) => !keptUrls.includes(url),
      );
      const removedKeys = removedUrls
        .map((url) => previousKeyByUrl.get(url))
        .filter((key): key is string => Boolean(key));
      keysToDeleteOnSuccess.push(...removedKeys);
    }

    if (videoFile) {
      const built = await buildVideoFromUpload(videoFile);
      newlyUploadedVideoKey = built.videoKey;
      if (product.videoSource === "upload" && product.videoKey) {
        videoKeyToDeleteOnSuccess = product.videoKey;
      }
      product.videoUrl = built.videoUrl;
      product.videoSource = built.videoSource;
      product.videoKey = built.videoKey;
    } else if (videoSource === "youtube" && videoUrl) {
      const built = buildVideoFromYoutube(String(videoUrl));
      if (product.videoSource === "upload" && product.videoKey) {
        videoKeyToDeleteOnSuccess = product.videoKey;
      }
      product.videoUrl = built.videoUrl;
      product.videoSource = built.videoSource;
      product.videoKey = built.videoKey;
    } else if (removeVideo === "true" || removeVideo === true) {
      if (product.videoSource === "upload" && product.videoKey) {
        videoKeyToDeleteOnSuccess = product.videoKey;
      }
      product.videoUrl = "";
      product.videoSource = "";
      product.videoKey = "";
    }

    try {
      await product.save();
    } catch (err) {
      await Promise.all(newlyUploadedKeys.map((key) => deleteFromSpaces(key)));
      if (newlyUploadedVideoKey) await deleteFromSpaces(newlyUploadedVideoKey);
      throw err;
    }

    await Promise.all(
      keysToDeleteOnSuccess.map((key) => deleteFromSpaces(key)),
    );
    if (videoKeyToDeleteOnSuccess) await deleteFromSpaces(videoKeyToDeleteOnSuccess);

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

    const deletions: Promise<void>[] = [];
    if (product.featureImageKey) {
      deletions.push(deleteFromSpaces(product.featureImageKey));
    }
    product.galleryImageKeys.forEach((key) => {
      if (key) deletions.push(deleteFromSpaces(key));
    });
    if (product.videoSource === "upload" && product.videoKey) {
      deletions.push(deleteFromSpaces(product.videoKey));
    }
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
