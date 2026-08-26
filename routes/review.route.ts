import { Router } from "express";
import {
  getMyOrderReviews,
  getProductReviews,
  getReviewsForModeration,
  moderateReview,
  submitReview,
} from "../controllers/review.controller";
import { authorize, protect } from "../middleware/auth";
import { reviewUpload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import {
  moderateReviewRules,
  submitReviewRules,
} from "../validators/review.validator";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: Verified-purchase product reviews and staff moderation
 */

/**
 * @swagger
 * /reviews/products/{productId}:
 *   get:
 *     summary: Get approved reviews for one product
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 50 }
 *     responses:
 *       200:
 *         description: Approved product reviews and rating summary
 */
router.get("/products/:productId", getProductReviews);

/**
 * @swagger
 * /reviews/orders/{orderId}:
 *   get:
 *     summary: Get the signed-in customer's reviews for an order
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/orders/:orderId",
  protect,
  authorize("customer"),
  getMyOrderReviews
);

/**
 * @swagger
 * /reviews/orders/{orderId}/products/{productId}:
 *   post:
 *     summary: Submit a review for a purchased product
 *     description: The order must belong to the customer and be both delivered and paid. Each product can be reviewed only once per order.
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [rating, comment]
 *             properties:
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string, maxLength: 1000 }
 *               attachments:
 *                 type: array
 *                 maxItems: 5
 *                 items: { type: string, format: binary }
 *     responses:
 *       201: { description: Review submitted for approval }
 *       422: { description: Order is not delivered and paid }
 */
router.post(
  "/orders/:orderId/products/:productId",
  protect,
  authorize("customer"),
  reviewUpload.array("attachments", 5),
  submitReviewRules,
  validate,
  submitReview
);

/**
 * @swagger
 * /reviews/moderation:
 *   get:
 *     summary: Get paginated reviews awaiting moderation
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/moderation",
  protect,
  authorize("manager", "admin", "superadmin"),
  getReviewsForModeration
);

/**
 * @swagger
 * /reviews/{id}/moderate:
 *   patch:
 *     summary: Approve or reject a review
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  "/:id/moderate",
  protect,
  authorize("manager", "admin", "superadmin"),
  moderateReviewRules,
  validate,
  moderateReview
);

export default router;
