import { body, type ValidationChain } from "express-validator";
import mongoose from "mongoose";
import {
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from "../models/order.model";
import { BD_DIVISIONS, DELIVERY_ZONES, PHONE_REGEX } from "../models/user.model";

const isValidObjectId = (value: string) => mongoose.Types.ObjectId.isValid(value);

export const createOrderRules: ValidationChain[] = [
  body("customerName").trim().notEmpty().withMessage("Customer name is required"),
  body("customerCompany")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 120 })
    .withMessage("Company name must be 120 characters or fewer"),
  body("customerPhone")
    .trim()
    .notEmpty()
    .withMessage("Customer phone is required")
    .matches(PHONE_REGEX)
    .withMessage("Please enter a valid phone number"),
  body("customerEmail")
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage("Please enter a valid email address"),
  body("shippingAddress")
    .isObject()
    .withMessage("Shipping address is required"),
  body("shippingAddress.division")
    .notEmpty()
    .withMessage("Shipping division is required")
    .isIn(BD_DIVISIONS)
    .withMessage("Select a valid shipping division"),
  body("shippingAddress.district").optional({ checkFalsy: true }).trim(),
  body("shippingAddress.upazila").optional({ checkFalsy: true }).trim(),
  body("shippingAddress.postOffice").optional({ checkFalsy: true }).trim(),
  body("shippingAddress.postCode")
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[0-9]{4}$/)
    .withMessage("Post code must contain exactly four digits"),
  body("shippingAddress.area")
    .trim()
    .isLength({ min: 3 })
    .withMessage("Street address is required"),
  body("shippingAddress.zone")
    .notEmpty()
    .withMessage("Delivery zone is required")
    .isIn(DELIVERY_ZONES)
    .withMessage("Select a valid delivery zone"),
  body("items")
    .isArray({ min: 1 })
    .withMessage("An order must have at least one item")
    .custom((items: { product?: unknown }[]) => {
      const ids = items.map((item) => String(item?.product ?? ""));
      return new Set(ids).size === ids.length;
    })
    .withMessage("Each product may appear only once per order"),
  body("items.*.product")
    .custom(isValidObjectId)
    .withMessage("Each item must reference a valid product id"),
  body("items.*.quantity")
    .isInt({ min: 1, max: 99 })
    .withMessage("Each item's quantity must be between 1 and 99")
    .toInt(),
  body("deliveryFee")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Delivery fee must be a non-negative number")
    .toFloat(),
  body("discount")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Discount must be a non-negative number")
    .toFloat(),
  body("paymentMethod")
    .isIn(PAYMENT_METHODS)
    .withMessage(`Payment method must be one of: ${PAYMENT_METHODS.join(", ")}`),
  body("notes").optional({ checkFalsy: true }).trim(),
];

export const updateOrderRules: ValidationChain[] = [
  body("orderStatus")
    .optional()
    .isIn(ORDER_STATUSES)
    .withMessage(`Order status must be one of: ${ORDER_STATUSES.join(", ")}`),
  body("paymentStatus")
    .optional()
    .isIn(PAYMENT_STATUSES)
    .withMessage(`Payment status must be one of: ${PAYMENT_STATUSES.join(", ")}`),
  body("notes").optional({ checkFalsy: true }).trim(),
  body("customerName")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Customer name cannot be empty"),
  body("customerCompany")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 120 })
    .withMessage("Company name must be 120 characters or fewer"),
  body("customerPhone")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Customer phone cannot be empty")
    .matches(PHONE_REGEX)
    .withMessage("Please enter a valid phone number"),
  body("customerEmail")
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage("Please enter a valid email address"),
  body("shippingAddress.division").optional({ checkFalsy: true }).isIn(BD_DIVISIONS),
  body("shippingAddress.district").optional({ checkFalsy: true }).trim(),
  body("shippingAddress.upazila").optional({ checkFalsy: true }).trim(),
  body("shippingAddress.postOffice").optional({ checkFalsy: true }).trim(),
  body("shippingAddress.postCode").optional({ checkFalsy: true }).trim(),
  body("shippingAddress.area").optional({ checkFalsy: true }).trim(),
  body("shippingAddress.zone").optional({ checkFalsy: true }).isIn(DELIVERY_ZONES),
  body("items")
    .optional()
    .isArray({ min: 1 })
    .withMessage("An order must have at least one item"),
  body("items.*.product")
    .optional()
    .custom(isValidObjectId)
    .withMessage("Each item must reference a valid product id"),
  body("items.*.quantity")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Each item's quantity must be a positive integer")
    .toInt(),
];
