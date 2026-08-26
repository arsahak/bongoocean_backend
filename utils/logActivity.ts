import type { Request } from "express";
import {
  ActivityLog,
  type ActivityAction,
  type ActivityModuleName,
} from "../models/activityLog.model";

interface LogActivityParams {
  req: Request;
  action: ActivityAction;
  module: ActivityModuleName;
  resourceId?: unknown;
  resourceName?: string;
  description: string;
  metadata?: Record<string, unknown>;
}

// Fire-and-forget: never let audit logging fail or slow down the request that
// triggered it. Only staff actions are recorded — customer-initiated requests
// (e.g. placing their own order, submitting a review) are routine usage, not
// something an admin needs to audit.
export const logActivity = async ({
  req,
  action,
  module,
  resourceId,
  resourceName,
  description,
  metadata,
}: LogActivityParams): Promise<void> => {
  const actor = req.user;
  if (!actor || actor.role === "customer") return;

  try {
    await ActivityLog.create({
      user: actor._id,
      userName: [actor.firstName, actor.lastName].filter(Boolean).join(" "),
      userRole: actor.role,
      action,
      module,
      resourceId,
      resourceName,
      description,
      metadata,
    });
  } catch (err) {
    console.error("Failed to record activity log:", err);
  }
};
