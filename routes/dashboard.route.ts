import { Router } from "express";
import { getDashboardOverview } from "../controllers/dashboard.controller";
import { authorize, protect } from "../middleware/auth";

const router = Router();

/**
 * @swagger
 * /dashboard:
 *   get:
 *     summary: Get period-based commerce dashboard analytics
 *     tags: [Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [today, last-7-days, last-30-days, this-month, last-3-months, last-6-months, this-year, last-year]
 *           default: this-year
 *     responses:
 *       200:
 *         description: Current order, revenue, chart, and best-selling product data
 *       400:
 *         description: Invalid period
 *       401:
 *         description: Not authenticated
 */
router.get(
  "/",
  protect,
  authorize("manager", "admin", "superadmin"),
  getDashboardOverview
);

export default router;
