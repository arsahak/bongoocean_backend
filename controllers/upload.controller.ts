import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { uploadToSpaces } from "../utils/uploadToSpaces";

/**
 * @swagger
 * /uploads/image:
 *   post:
 *     summary: Upload an image for use inside rich-text content (manager/admin/superadmin only)
 *     description: >
 *       Used by the dashboard's rich-text editor (product overview/short
 *       description, etc.) to upload an inline image and get back a hosted
 *       URL to embed — separate from the product feature/gallery image
 *       uploads, which go through /products directly.
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Image uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       403:
 *         description: Not permitted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       422:
 *         description: No image provided, or an unsupported file type
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
export const uploadContentImage = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.file) throw new ApiError(422, "An image file is required");

    const uploaded = await uploadToSpaces(req.file, "content");
    return ApiResponse(res, 201, "Image uploaded successfully", {
      url: uploaded.url,
    });
  },
);
