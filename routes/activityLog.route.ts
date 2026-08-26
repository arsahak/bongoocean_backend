import { Router } from "express";
import { getActivityLogs } from "../controllers/activityLog.controller";
import { protect, authorize } from "../middleware/auth";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: ActivityLogs
 *   description: Audit trail of staff-performed create/update/delete actions
 */

/**
 * @swagger
 * /activity-logs:
 *   get:
 *     summary: List activity logs (admin/superadmin only)
 *     tags: [ActivityLogs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: module
 *         schema:
 *           type: string
 *           enum: [product, category, brand, supplier, stock, order, customer, staff, review]
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           enum: [create, update, delete]
 *       - in: query
 *         name: user
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Activity logs fetched successfully
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
 *                     logs:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ActivityLog'
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
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
 */
router.get("/", protect, authorize("admin", "superadmin"), getActivityLogs);

export default router;
