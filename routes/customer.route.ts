import { Router } from "express";
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from "../controllers/customer.controller";
import { authorize, protect } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  createCustomerRules,
  updateCustomerRules,
} from "../validators/customer.validator";

const router = Router();
const staffOnly = [protect, authorize("manager", "admin", "superadmin")];

/**
 * @swagger
 * tags:
 *   name: Customers
 *   description: Paginated customer account management for staff
 */

router
  .route("/")
  .get(...staffOnly, listCustomers)
  .post(...staffOnly, createCustomerRules, validate, createCustomer);

router
  .route("/:id")
  .get(...staffOnly, getCustomer)
  .patch(...staffOnly, updateCustomerRules, validate, updateCustomer)
  .delete(...staffOnly, deleteCustomer);

export default router;
