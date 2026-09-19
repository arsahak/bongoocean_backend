import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { UserRole } from "../models/user.model";

export interface TokenPayload {
  id: string;
  role: UserRole;
}

export const generateToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
};

// Vendors are a separate account type from User (no `role`), so their token
// carries a `type: "vendor"` discriminator instead — this keeps a vendor
// token from ever being mistaken for a staff/customer User token, or vice
// versa, by whichever protect middleware verifies it.
export interface VendorTokenPayload {
  id: string;
  type: "vendor";
}

export const generateVendorToken = (id: string): string => {
  const payload: VendorTokenPayload = { id, type: "vendor" };
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
};
