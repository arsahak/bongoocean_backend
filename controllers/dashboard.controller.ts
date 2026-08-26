import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { Order } from "../models/order.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";

const DASHBOARD_PERIODS = [
  "today",
  "last-7-days",
  "last-30-days",
  "this-month",
  "last-3-months",
  "last-6-months",
  "this-year",
  "last-year",
] as const;

type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];
type BucketUnit = "hour" | "day" | "month";

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DHAKA_TIMEZONE = "Asia/Dhaka";

const dhakaDate = (year: number, month: number, day: number, hour = 0) =>
  new Date(Date.UTC(year, month, day, hour) - DHAKA_OFFSET_MS);

const getDhakaParts = (date: Date) => {
  const shifted = new Date(date.getTime() + DHAKA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
  };
};

const getPeriodRange = (period: DashboardPeriod, now = new Date()) => {
  const { year, month, day } = getDhakaParts(now);
  const today = dhakaDate(year, month, day);
  let start: Date;
  let end = now;
  let unit: BucketUnit;

  switch (period) {
    case "today":
      start = today;
      unit = "hour";
      break;
    case "last-7-days":
      start = new Date(today.getTime() - 6 * 86400000);
      unit = "day";
      break;
    case "last-30-days":
      start = new Date(today.getTime() - 29 * 86400000);
      unit = "day";
      break;
    case "this-month":
      start = dhakaDate(year, month, 1);
      unit = "day";
      break;
    case "last-3-months":
      start = dhakaDate(year, month - 2, 1);
      unit = "month";
      break;
    case "last-6-months":
      start = dhakaDate(year, month - 5, 1);
      unit = "month";
      break;
    case "last-year":
      start = dhakaDate(year - 1, 0, 1);
      end = dhakaDate(year, 0, 1);
      unit = "month";
      break;
    default:
      start = dhakaDate(year, 0, 1);
      unit = "month";
  }

  return { start, end, unit };
};

const bucketKey = (date: Date, unit: BucketUnit) => {
  const { year, month, day, hour } = getDhakaParts(date);
  const two = (value: number) => String(value).padStart(2, "0");
  if (unit === "hour") return `${year}-${two(month + 1)}-${two(day)} ${two(hour)}:00`;
  if (unit === "day") return `${year}-${two(month + 1)}-${two(day)}`;
  return `${year}-${two(month + 1)}`;
};

const bucketLabel = (date: Date, unit: BucketUnit, period: DashboardPeriod) => {
  if (unit === "hour") {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: DHAKA_TIMEZONE }).format(date);
  }
  if (unit === "day") {
    return new Intl.DateTimeFormat("en-US", {
      ...(period === "last-7-days" ? { weekday: "short" as const } : { month: "short" as const, day: "numeric" as const }),
      timeZone: DHAKA_TIMEZONE,
    }).format(date);
  }
  return new Intl.DateTimeFormat("en-US", { month: "short", year: period === "last-year" ? undefined : "2-digit", timeZone: DHAKA_TIMEZONE }).format(date);
};

const buildBuckets = (period: DashboardPeriod, start: Date, end: Date, unit: BucketUnit) => {
  const buckets: Array<{ key: string; label: string }> = [];
  let cursor = start;
  while (cursor < end) {
    buckets.push({ key: bucketKey(cursor, unit), label: bucketLabel(cursor, unit, period) });
    if (unit === "hour") cursor = new Date(cursor.getTime() + 3600000);
    else if (unit === "day") cursor = new Date(cursor.getTime() + 86400000);
    else {
      const { year, month } = getDhakaParts(cursor);
      cursor = dhakaDate(year, month + 1, 1);
    }
  }
  return buckets;
};

const dateFormatFor = (unit: BucketUnit) =>
  unit === "hour" ? "%Y-%m-%d %H:00" : unit === "day" ? "%Y-%m-%d" : "%Y-%m";

type TotalsResult = {
  _id: null;
  allOrders: number;
  delivered: number;
  pending: number;
  processing: number;
  shipped: number;
  cancelled: number;
  paidOrders: number;
  revenue: number;
};

const percentageChange = (current: number, previous: number) => {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(1));
};

const emptyTotals = (): Omit<TotalsResult, "_id"> => ({
  allOrders: 0,
  delivered: 0,
  pending: 0,
  processing: 0,
  shipped: 0,
  cancelled: 0,
  paidOrders: 0,
  revenue: 0,
});

const totalsPipeline = (start: Date, end: Date) => [
  { $match: { createdAt: { $gte: start, $lt: end } } },
  {
    $group: {
      _id: null,
      allOrders: { $sum: 1 },
      delivered: { $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, 1, 0] } },
      pending: { $sum: { $cond: [{ $eq: ["$orderStatus", "pending"] }, 1, 0] } },
      processing: { $sum: { $cond: [{ $eq: ["$orderStatus", "processing"] }, 1, 0] } },
      shipped: { $sum: { $cond: [{ $eq: ["$orderStatus", "shipped"] }, 1, 0] } },
      cancelled: { $sum: { $cond: [{ $eq: ["$orderStatus", "cancelled"] }, 1, 0] } },
      paidOrders: { $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] } },
      revenue: { $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$total", 0] } },
    },
  },
];

export const getDashboardOverview = asyncHandler(async (req: Request, res: Response) => {
  const requestedPeriod = String(req.query.period || "this-year") as DashboardPeriod;
  if (!DASHBOARD_PERIODS.includes(requestedPeriod)) {
    throw new ApiError(400, `Invalid period. Use one of: ${DASHBOARD_PERIODS.join(", ")}`);
  }

  const { start, end, unit } = getPeriodRange(requestedPeriod);
  const duration = end.getTime() - start.getTime();
  const previousStart = new Date(start.getTime() - duration);
  const buckets = buildBuckets(requestedPeriod, start, end, unit);

  const [totalsRows, previousRows, chartRows, bestSellingProducts] = await Promise.all([
    Order.aggregate<TotalsResult>(totalsPipeline(start, end)),
    Order.aggregate<TotalsResult>(totalsPipeline(previousStart, start)),
    Order.aggregate<{ _id: string; orders: number; delivered: number; revenue: number }>([
      { $match: { createdAt: { $gte: start, $lt: end } } },
      {
        $group: {
          _id: { $dateToString: { date: "$createdAt", format: dateFormatFor(unit), timezone: DHAKA_TIMEZONE } },
          orders: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, 1, 0] } },
          revenue: { $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$total", 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate<{
      productId: unknown;
      title: string;
      sku: string;
      image: string;
      category?: { name?: string };
      sold: number;
      revenue: number;
      stock: number;
    }>([
      { $match: { createdAt: { $gte: start, $lt: end }, orderStatus: { $ne: "cancelled" } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          title: { $last: "$items.title" },
          sku: { $last: "$items.sku" },
          orderImage: { $last: "$items.image" },
          sold: { $sum: "$items.quantity" },
          revenue: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "paid"] },
                { $multiply: ["$items.price", "$items.quantity"] },
                0,
              ],
            },
          },
        },
      },
      { $sort: { sold: -1, revenue: -1 } },
      { $limit: 5 },
      { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "product" } },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "categories", localField: "product.category", foreignField: "_id", as: "category" } },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          productId: "$_id",
          title: 1,
          sku: 1,
          image: { $ifNull: ["$product.featureImage", "$orderImage"] },
          category: { name: "$category.name" },
          sold: 1,
          revenue: 1,
          stock: { $ifNull: ["$product.stock", 0] },
        },
      },
    ]),
  ]);

  const totals = totalsRows[0] || emptyTotals();
  const previous = previousRows[0] || emptyTotals();
  const chartByKey = new Map(chartRows.map((row) => [row._id, row]));
  const chart = buckets.map((bucket) => ({
    ...bucket,
    orders: chartByKey.get(bucket.key)?.orders || 0,
    delivered: chartByKey.get(bucket.key)?.delivered || 0,
    revenue: chartByKey.get(bucket.key)?.revenue || 0,
  }));
  const bestBucket = chart.reduce(
    (best, bucket) => (bucket.revenue > best.revenue ? bucket : best),
    chart[0] || { key: "", label: "No data", orders: 0, delivered: 0, revenue: 0 }
  );

  return ApiResponse(res, 200, "Dashboard overview fetched successfully", {
    period: requestedPeriod,
    range: { start, end, timezone: DHAKA_TIMEZONE },
    totals: {
      ...totals,
      averageOrderValue: totals.paidOrders ? Number((totals.revenue / totals.paidOrders).toFixed(2)) : 0,
      deliverySuccessRate: totals.allOrders ? Number(((totals.delivered / totals.allOrders) * 100).toFixed(1)) : 0,
      cancellationRate: totals.allOrders ? Number(((totals.cancelled / totals.allOrders) * 100).toFixed(1)) : 0,
    },
    changes: {
      orders: percentageChange(totals.allOrders, previous.allOrders),
      delivered: percentageChange(totals.delivered, previous.delivered),
      pending: percentageChange(totals.pending, previous.pending),
      cancelled: percentageChange(totals.cancelled, previous.cancelled),
      revenue: percentageChange(totals.revenue, previous.revenue),
    },
    chart,
    bestPerformingPeriod: bestBucket,
    bestSellingProducts,
  });
});
