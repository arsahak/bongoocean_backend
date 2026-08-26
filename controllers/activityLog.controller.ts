import type { Request, Response } from "express";
import { ActivityLog } from "../models/activityLog.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";

export const getActivityLogs = asyncHandler(
  async (req: Request, res: Response) => {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20),
    );
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (req.query.module) filter.module = req.query.module;
    if (req.query.action) filter.action = req.query.action;
    if (req.query.user) filter.user = req.query.user;
    if (req.query.search) {
      const escapedSearch = String(req.query.search)
        .trim()
        .slice(0, 100)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (escapedSearch) {
        const pattern = { $regex: escapedSearch, $options: "i" };
        filter.$or = [
          { description: pattern },
          { resourceName: pattern },
          { userName: pattern },
        ];
      }
    }

    const [logs, total] = await Promise.all([
      ActivityLog.find(filter)
        .populate("user", "firstName lastName email role avatar")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ActivityLog.countDocuments(filter),
    ]);

    return ApiResponse(res, 200, "Activity logs fetched successfully", {
      logs,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  },
);
