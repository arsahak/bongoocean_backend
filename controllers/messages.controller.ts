import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../middleware/asyncHandler";
import {
  CONVERSATION_STATUSES,
  Message,
  MessageConversation,
  type ConversationStatus,
} from "../models/messages.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import {
  createMessageRealtimeTicket,
  emitConversationUpdated,
  emitNewMessage,
} from "../realtime/messagesRealtime";

const VISITOR_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAFF_ROLES = ["manager", "admin", "superadmin"];
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const visitorIdFrom = (req: Request) =>
  String(req.body?.visitorId || req.query.visitorId || req.headers["x-visitor-id"] || "").trim();

const requireVisitorId = (req: Request) => {
  const visitorId = visitorIdFrom(req);
  if (!VISITOR_ID_PATTERN.test(visitorId)) {
    throw new ApiError(400, "A valid visitor ID is required");
  }
  return visitorId;
};

const resolveCustomerConversation = async (req: Request, create = true) => {
  if (req.user?.role === "customer") {
    let conversation = await MessageConversation.findOne({ customer: req.user._id });
    if (!conversation && create) {
      const visitorId = visitorIdFrom(req);
      if (VISITOR_ID_PATTERN.test(visitorId)) {
        conversation = await MessageConversation.findOne({ visitorId });
        if (conversation) {
          conversation.customer = req.user._id as mongoose.Types.ObjectId;
          conversation.visitorId = undefined;
          await conversation.save();
          await Message.updateMany(
            { conversation: conversation._id },
            { $set: { customer: req.user._id }, $unset: { visitorId: 1 } }
          );
        }
      }
      if (!conversation) {
        conversation = await MessageConversation.create({ customer: req.user._id });
      }
    }
    return conversation;
  }

  const visitorId = requireVisitorId(req);
  let conversation = await MessageConversation.findOne({ visitorId });
  if (!conversation && create) {
    conversation = await MessageConversation.create({ visitorId });
  }
  return conversation;
};

const conversationPayload = async (conversationId: mongoose.Types.ObjectId | string) => {
  const conversation = await MessageConversation.findById(conversationId)
    .populate("customer", "firstName lastName email phone avatar")
    .lean();
  if (!conversation) throw new ApiError(404, "Conversation not found");

  const messages = await Message.find({ conversation: conversation._id })
    .populate("senderUser", "firstName lastName role avatar")
    .sort({ createdAt: 1 })
    .limit(500)
    .lean();

  return { conversation, messages };
};

export const getMyConversation = asyncHandler(async (req: Request, res: Response) => {
  const conversation = await resolveCustomerConversation(req, true);
  if (!conversation) throw new ApiError(404, "Conversation not found");

  if (conversation.unreadForCustomer > 0) {
    conversation.unreadForCustomer = 0;
    await conversation.save();
  }
  const data = await conversationPayload(conversation._id as mongoose.Types.ObjectId);
  return ApiResponse(res, 200, "Conversation fetched successfully", {
    ...data,
    realtimeTicket: createMessageRealtimeTicket("conversation", String(conversation._id)),
  });
});

export const sendCustomerMessage = asyncHandler(async (req: Request, res: Response) => {
  const text = String(req.body.text || "").trim();
  if (!text || text.length > 2000) {
    throw new ApiError(422, "Message must contain between 1 and 2000 characters");
  }

  const conversation = await resolveCustomerConversation(req, true);
  if (!conversation) throw new ApiError(404, "Conversation not found");
  const sender = req.user?.role === "customer" ? "customer" : "visitor";
  const message = await Message.create({
    conversation: conversation._id,
    customer: conversation.customer,
    visitorId: conversation.visitorId,
    sender,
    senderUser: req.user?._id,
    text,
  });

  conversation.status = "open";
  conversation.lastMessage = text;
  conversation.lastMessageAt = message.createdAt;
  conversation.unreadForStaff += 1;
  await conversation.save();

  const populatedMessage = await Message.findById(message._id)
    .populate("senderUser", "firstName lastName role avatar")
    .lean();
  const event = { conversationId: String(conversation._id), message: populatedMessage };
  emitNewMessage(String(conversation._id), event);
  emitConversationUpdated(String(conversation._id), { conversationId: String(conversation._id) });
  return ApiResponse(res, 201, "Message sent successfully", event);
});

export const listConversations = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const status = String(req.query.status || "all");
  if (status !== "all" && !CONVERSATION_STATUSES.includes(status as ConversationStatus)) {
    throw new ApiError(400, "Invalid conversation status");
  }
  const filter: Record<string, unknown> = status === "all" ? {} : { status };
  const search = String(req.query.search || "").trim();
  if (search) {
    const safeSearch = escapeRegex(search);
    const customerIds = await mongoose.model("User").find({
      role: "customer",
      $or: [
        { firstName: { $regex: safeSearch, $options: "i" } },
        { lastName: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
        { phone: { $regex: safeSearch, $options: "i" } },
      ],
    }).distinct("_id");
    filter.$or = [
      { customer: { $in: customerIds } },
      { visitorId: { $regex: safeSearch, $options: "i" } },
      { lastMessage: { $regex: safeSearch, $options: "i" } },
    ];
  }

  const [conversations, total, totalCount, openCount, unreadCount, totalMessages] = await Promise.all([
    MessageConversation.find(filter)
      .populate("customer", "firstName lastName email phone avatar")
      .sort({ lastMessageAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    MessageConversation.countDocuments(filter),
    MessageConversation.countDocuments(),
    MessageConversation.countDocuments({ status: "open" }),
    MessageConversation.countDocuments({ unreadForStaff: { $gt: 0 } }),
    Message.countDocuments(),
  ]);

  const messageCounts = await Message.aggregate<{
    _id: mongoose.Types.ObjectId;
    count: number;
  }>([
    { $match: { conversation: { $in: conversations.map(({ _id }) => _id) } } },
    { $group: { _id: "$conversation", count: { $sum: 1 } } },
  ]);
  const countByConversation = new Map(
    messageCounts.map(({ _id, count }) => [String(_id), count])
  );
  const conversationsWithCounts = conversations.map((conversation) => ({
    ...conversation,
    messageCount: countByConversation.get(String(conversation._id)) ?? 0,
  }));

  return ApiResponse(res, 200, "Conversations fetched successfully", {
    conversations: conversationsWithCounts,
    summary: {
      total: totalCount,
      totalMessages,
      open: openCount,
      closed: totalCount - openCount,
      unread: unreadCount,
    },
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasPreviousPage: page > 1,
      hasNextPage: page * limit < total,
    },
  });
});

export const getConversationForStaff = asyncHandler(async (req: Request, res: Response) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw new ApiError(400, "Invalid conversation ID");
  const conversation = await MessageConversation.findById(req.params.id);
  if (!conversation) throw new ApiError(404, "Conversation not found");
  conversation.unreadForStaff = 0;
  await conversation.save();
  return ApiResponse(res, 200, "Conversation fetched successfully", await conversationPayload(conversation._id as mongoose.Types.ObjectId));
});

export const replyToConversation = asyncHandler(async (req: Request, res: Response) => {
  const text = String(req.body.text || "").trim();
  if (!text || text.length > 2000) throw new ApiError(422, "Reply must contain between 1 and 2000 characters");
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw new ApiError(400, "Invalid conversation ID");
  const conversation = await MessageConversation.findById(req.params.id);
  if (!conversation) throw new ApiError(404, "Conversation not found");

  const message = await Message.create({
    conversation: conversation._id,
    customer: conversation.customer,
    visitorId: conversation.visitorId,
    sender: "staff",
    senderUser: req.user!._id,
    text,
  });
  conversation.lastMessage = text;
  conversation.lastMessageAt = message.createdAt;
  conversation.unreadForCustomer += 1;
  conversation.unreadForStaff = 0;
  await conversation.save();

  const populatedMessage = await Message.findById(message._id)
    .populate("senderUser", "firstName lastName role avatar")
    .lean();
  const event = { conversationId: String(conversation._id), message: populatedMessage };
  emitNewMessage(String(conversation._id), event);
  emitConversationUpdated(String(conversation._id), { conversationId: String(conversation._id) });
  return ApiResponse(res, 201, "Reply sent successfully", event);
});

export const updateConversationStatus = asyncHandler(async (req: Request, res: Response) => {
  const status = String(req.body.status || "") as ConversationStatus;
  if (!CONVERSATION_STATUSES.includes(status)) throw new ApiError(422, "Status must be open or closed");
  const conversation = await MessageConversation.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!conversation) throw new ApiError(404, "Conversation not found");
  emitConversationUpdated(String(conversation._id), { conversationId: String(conversation._id), status });
  return ApiResponse(res, 200, "Conversation status updated", conversation);
});

export const getRealtimeTicket = asyncHandler(async (req: Request, res: Response) => {
  if (req.user && STAFF_ROLES.includes(req.user.role)) {
    return ApiResponse(res, 200, "Realtime ticket created", {
      ticket: createMessageRealtimeTicket("staff"),
    });
  }
  const conversation = await resolveCustomerConversation(req, false);
  if (!conversation) throw new ApiError(404, "Conversation not found");
  return ApiResponse(res, 200, "Realtime ticket created", {
    ticket: createMessageRealtimeTicket("conversation", String(conversation._id)),
  });
});
