import { body, type ValidationChain } from "express-validator";
import {
  BD_DIVISIONS,
  DELIVERY_ZONES,
  EMAIL_REGEX,
  PHONE_REGEX,
} from "../models/user.model";

export const signupRules: ValidationChain[] = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters"),
  body("email")
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage("Please enter a valid email address")
    .customSanitizer((value: string) => value.toLowerCase()),
  body("phone")
    .optional({ checkFalsy: true })
    .trim()
    .matches(PHONE_REGEX)
    .withMessage("Please enter a valid phone number"),
  body("address").custom((value) => {
    if (typeof value === "string" && value.trim().length >= 3) return true;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const supportedFields = [
        "division",
        "district",
        "upazila",
        "postOffice",
        "postCode",
        "area",
        "zone",
      ];
      return supportedFields.some(
        (field) =>
          typeof value[field] === "string" && value[field].trim().length > 0
      );
    }
    throw new Error("Address is required");
  }),
  body("address.division")
    .optional({ checkFalsy: true })
    .isIn(BD_DIVISIONS)
    .withMessage(`Division must be one of: ${BD_DIVISIONS.join(", ")}`),
  body("address.postCode")
    .optional({ checkFalsy: true })
    .matches(/^[0-9]{4}$/)
    .withMessage("Please enter a valid 4-digit post code"),
  body("address.zone")
    .optional({ checkFalsy: true })
    .isIn(DELIVERY_ZONES)
    .withMessage(`Zone must be one of: ${DELIVERY_ZONES.join(", ")}`),
  body("password")
    .isString()
    .isLength({ min: 8, max: 72 })
    .withMessage("Password must be between 8 and 72 characters"),
  body().custom((_value, { req }) => {
    if (!req.body.email && !req.body.phone) {
      throw new Error("Either email or phone is required");
    }
    return true;
  }),
];

export const signinRules: ValidationChain[] = [
  body("identifier")
    .trim()
    .notEmpty()
    .withMessage("Email or phone is required")
    .custom((value: string) => {
      if (EMAIL_REGEX.test(value) || PHONE_REGEX.test(value)) return true;
      throw new Error("Enter a valid email address or phone number");
    }),
  body("password")
    .isString()
    .notEmpty()
    .withMessage("Password is required"),
];
