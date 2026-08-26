import mongoose, { Document, Schema, Types } from "mongoose";

export const CONVERSATION_STATUSES = ["open", "closed"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];
export type MessageSender = "customer" | "visitor" | "staff";

export interface IMessageConversation extends Document {
  customer?: Types.ObjectId;
  visitorId?: string;
  status: ConversationStatus;
  lastMessage: string;
  lastMessageAt: Date;
  unreadForStaff: number;
  unreadForCustomer: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMessage extends Document {
  conversation: Types.ObjectId;
  customer?: Types.ObjectId;
  visitorId?: string;
  sender: MessageSender;
  senderUser?: Types.ObjectId;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IMessageConversation>(
  {
    customer: { type: Schema.Types.ObjectId, ref: "User" },
    visitorId: { type: String, trim: true, maxlength: 100 },
    status: { type: String, enum: CONVERSATION_STATUSES, default: "open" },
    lastMessage: { type: String, trim: true, default: "", maxlength: 2000 },
    lastMessageAt: { type: Date, default: Date.now },
    unreadForStaff: { type: Number, default: 0, min: 0 },
    unreadForCustomer: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

conversationSchema.index(
  { customer: 1 },
  { unique: true, partialFilterExpression: { customer: { $type: "objectId" } } }
);
conversationSchema.index(
  { visitorId: 1 },
  { unique: true, partialFilterExpression: { visitorId: { $type: "string" } } }
);
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.pre("validate", function (next) {
  if ((!this.customer && !this.visitorId) || (this.customer && this.visitorId)) {
    return next(new Error("A conversation requires either a customer or visitor identity"));
  }
  next();
});

const messageSchema = new Schema<IMessage>(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "MessageConversation",
      required: true,
      index: true,
    },
    customer: { type: Schema.Types.ObjectId, ref: "User" },
    visitorId: { type: String, trim: true, maxlength: 100 },
    sender: {
      type: String,
      enum: ["customer", "visitor", "staff"],
      required: true,
    },
    senderUser: { type: Schema.Types.ObjectId, ref: "User" },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: 1 });

export const MessageConversation = mongoose.model<IMessageConversation>(
  "MessageConversation",
  conversationSchema
);
export const Message = mongoose.model<IMessage>("Message", messageSchema);
