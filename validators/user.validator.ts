import { body, type ValidationChain } from "express-validator";
import { BD_DIVISIONS, DELIVERY_ZONES, PHONE_REGEX, USER_ROLES } from "../models/user.model";

export const createStaffRules: ValidationChain[] = [
  body("firstName").trim().notEmpty().withMessage("First name is required"),
  body("lastName").trim().notEmpty().withMessage("Last name is required"),
  body("email")
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage("Please enter a valid email address"),
  body("phone")
    .optional({ checkFalsy: true })
    .matches(PHONE_REGEX)
    .withMessage("Please enter a valid phone number"),
  body("avatar")
    .optional({ checkFalsy: true })
    .isURL()
    .withMessage("Avatar must be a valid URL"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
  body("role")
    .isIn(USER_ROLES)
    .withMessage(`Role must be one of: ${USER_ROLES.join(", ")}`),
  body().custom((_value, { req }) => {
    if (!req.body.email && !req.body.phone) {
      throw new Error("Either email or phone is required");
    }
    return true;
  }),
];

export const updateStaffRules: ValidationChain[] = [
  body("firstName").optional().trim().notEmpty().withMessage("First name cannot be empty"),
  body("lastName").optional().trim().notEmpty().withMessage("Last name cannot be empty"),
  body("email")
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage("Please enter a valid email address"),
  body("phone")
    .optional({ checkFalsy: true })
    .matches(PHONE_REGEX)
    .withMessage("Please enter a valid phone number"),
  body("role")
    .optional()
    .isIn(USER_ROLES)
    .withMessage(`Role must be one of: ${USER_ROLES.join(", ")}`),
];

export const updateMeRules: ValidationChain[] = [
  body("firstName").optional().trim().notEmpty().withMessage("First name cannot be empty"),
  body("lastName").optional().trim().notEmpty().withMessage("Last name cannot be empty"),
  body("companyName").optional({ checkFalsy: true }).trim(),
  body("email")
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage("Please enter a valid email address"),
  body("phone")
    .optional({ checkFalsy: true })
    .matches(PHONE_REGEX)
    .withMessage("Please enter a valid phone number"),
  body("address.division").optional({ checkFalsy: true }).isIn(BD_DIVISIONS),
  body("address.district").optional({ checkFalsy: true }).trim(),
  body("address.upazila").optional({ checkFalsy: true }).trim(),
  body("address.postOffice").optional({ checkFalsy: true }).trim(),
  body("address.postCode")
    .optional({ checkFalsy: true })
    .matches(/^[0-9]{4}$/)
    .withMessage("Please enter a valid 4-digit post code"),
  body("address.area").optional({ checkFalsy: true }).trim(),
  body("address.zone").optional({ checkFalsy: true }).isIn(DELIVERY_ZONES),
  body("shipToDifferentAddress")
    .optional()
    .isBoolean()
    .withMessage("shipToDifferentAddress must be a boolean")
    .toBoolean(),
  body("shippingAddress")
    .optional()
    .isObject()
    .withMessage("Shipping address must be an object"),
  body("shippingAddress.division")
    .optional({ checkFalsy: true })
    .isIn(BD_DIVISIONS),
  body("shippingAddress.district").optional({ checkFalsy: true }).trim(),
  body("shippingAddress.upazila").optional({ checkFalsy: true }).trim(),
  body("shippingAddress.postOffice").optional({ checkFalsy: true }).trim(),
  body("shippingAddress.postCode")
    .optional({ checkFalsy: true })
    .matches(/^[0-9]{4}$/)
    .withMessage("Please enter a valid 4-digit shipping post code"),
  body("shippingAddress.area").optional({ checkFalsy: true }).trim(),
  body("shippingAddress.zone")
    .optional({ checkFalsy: true })
    .isIn(DELIVERY_ZONES),
  body().custom((_value, { req }) => {
    if (
      req.body.shipToDifferentAddress === true &&
      (!req.body.shippingAddress || !req.body.shippingAddress.division)
    ) {
      throw new Error(
        "A shipping address is required when using a different shipping address"
      );
    }
    return true;
  }),
];

export const changePasswordRules: ValidationChain[] = [
  body("currentPassword").notEmpty().withMessage("Current password is required"),
  body("newPassword")
    .isLength({ min: 6 })
    .withMessage("New password must be at least 6 characters"),
];
