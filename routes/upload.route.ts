import { Router } from "express";
import { uploadContentImage } from "../controllers/upload.controller";
import { protect, authorize } from "../middleware/auth";
import { upload } from "../middleware/upload";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Uploads
 *   description: Standalone file uploads not tied to a specific resource
 */

router.post(
  "/image",
  protect,
  authorize("manager", "admin", "superadmin"),
  upload.single("image"),
  uploadContentImage,
);

export default router;
