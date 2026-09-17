import { Router } from "express";
import {
  createCost,
  deleteCost,
  getCosts,
  updateCost,
} from "../controllers/cost.controller";
import { protect, authorize } from "../middleware/auth";
import { costingUpload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import {
  costIdRules,
  createCostRules,
  updateCostRules,
} from "../validators/cost.validator";

const router = Router();
const staffRoles = authorize("manager", "admin", "superadmin");

router
  .route("/")
  .get(protect, staffRoles, getCosts)
  .post(
    protect,
    staffRoles,
    costingUpload.single("attachment"),
    createCostRules,
    validate,
    createCost,
  );

router.patch(
  "/:id",
  protect,
  staffRoles,
  costingUpload.single("attachment"),
  costIdRules,
  updateCostRules,
  validate,
  updateCost,
);

// Deleting financial records is intentionally restricted to superadmins.
router.delete(
  "/:id",
  protect,
  authorize("superadmin"),
  costIdRules,
  validate,
  deleteCost,
);

export default router;
