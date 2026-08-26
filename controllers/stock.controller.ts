import type { Request, Response } from "express";
import { Stock } from "../models/stock.model";
import { Product } from "../models/product.model";
import { Supplier } from "../models/supplier.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { logActivity } from "../utils/logActivity";

export const getStocks = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20),
  );
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (req.query.product) filter.product = req.query.product;
  if (req.query.supplier) filter.supplier = req.query.supplier;

  const [stocks, total] = await Promise.all([
    Stock.find(filter)
      .populate("product", "title sku stock featureImage")
      .populate("supplier", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Stock.countDocuments(filter),
  ]);

  return ApiResponse(res, 200, "Stock entries fetched successfully", {
    stocks,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

export const getStock = asyncHandler(async (req: Request, res: Response) => {
  const stock = await Stock.findById(req.params.id)
    .populate("product", "title sku stock featureImage")
    .populate("supplier", "name");
  if (!stock) throw new ApiError(404, "Stock entry not found");
  return ApiResponse(res, 200, "Stock entry fetched successfully", stock);
});

export const createStock = asyncHandler(
  async (req: Request, res: Response) => {
    const { product, supplier, quantity, costPrice, note } = req.body;

    const productDoc = await Product.findById(product).select("title");
    if (!productDoc) throw new ApiError(422, "Product not found");

    const supplierDoc = await Supplier.findById(supplier).select("name");
    if (!supplierDoc) throw new ApiError(422, "Supplier not found");

    const stock = await Stock.create({
      product,
      supplier,
      quantity,
      costPrice,
      note,
    });

    try {
      await Product.findByIdAndUpdate(product, { $inc: { stock: quantity } });
    } catch (err) {
      await Stock.findByIdAndDelete(stock._id);
      throw err;
    }

    await stock.populate([
      { path: "product", select: "title sku stock featureImage" },
      { path: "supplier", select: "name" },
    ]);

    void logActivity({
      req,
      action: "create",
      module: "stock",
      resourceId: stock._id,
      resourceName: productDoc.title,
      description: `Added ${quantity} unit(s) of "${productDoc.title}" from supplier "${supplierDoc.name}"`,
    });

    return ApiResponse(res, 201, "Stock added successfully", stock);
  },
);

export const updateStock = asyncHandler(
  async (req: Request, res: Response) => {
    const stock = await Stock.findById(req.params.id);
    if (!stock) throw new ApiError(404, "Stock entry not found");

    const { product, supplier, quantity, costPrice, note } = req.body;

    const previousProduct = String(stock.product);
    const previousQuantity = stock.quantity;

    if (supplier !== undefined) {
      const supplierExists = await Supplier.exists({ _id: supplier });
      if (!supplierExists) throw new ApiError(422, "Supplier not found");
      stock.supplier = supplier;
    }

    if (product !== undefined) {
      const productExists = await Product.exists({ _id: product });
      if (!productExists) throw new ApiError(422, "Product not found");
      stock.product = product;
    }

    if (quantity !== undefined) stock.quantity = quantity;
    if (costPrice !== undefined) stock.costPrice = costPrice;
    if (note !== undefined) stock.note = note;

    await stock.save();

    const nextProduct = String(stock.product);
    const nextQuantity = stock.quantity;

    if (previousProduct === nextProduct) {
      const delta = nextQuantity - previousQuantity;
      if (delta !== 0) {
        await Product.findByIdAndUpdate(nextProduct, { $inc: { stock: delta } });
      }
    } else {
      await Product.findByIdAndUpdate(previousProduct, {
        $inc: { stock: -previousQuantity },
      });
      await Product.findByIdAndUpdate(nextProduct, {
        $inc: { stock: nextQuantity },
      });
    }

    await stock.populate([
      { path: "product", select: "title sku stock featureImage" },
      { path: "supplier", select: "name" },
    ]);

    const updatedProduct = stock.product as unknown as { title?: string };

    void logActivity({
      req,
      action: "update",
      module: "stock",
      resourceId: stock._id,
      resourceName: updatedProduct.title,
      description: `Updated stock entry for "${updatedProduct.title}" (quantity: ${stock.quantity})`,
    });

    return ApiResponse(res, 200, "Stock entry updated successfully", stock);
  },
);

export const deleteStock = asyncHandler(
  async (req: Request, res: Response) => {
    const stock = await Stock.findByIdAndDelete(req.params.id);
    if (!stock) throw new ApiError(404, "Stock entry not found");

    const product = await Product.findById(stock.product);
    if (product) {
      product.stock = Math.max(0, product.stock - stock.quantity);
      await product.save();
    }

    void logActivity({
      req,
      action: "delete",
      module: "stock",
      resourceId: stock._id,
      resourceName: product?.title,
      description: `Deleted stock entry${product ? ` for "${product.title}"` : ""} (quantity: ${stock.quantity})`,
    });

    return ApiResponse(res, 200, "Stock entry deleted successfully");
  },
);
