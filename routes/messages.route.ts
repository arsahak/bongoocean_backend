import { Router } from "express";
import {
  getConversationForStaff,
  getMyConversation,
  getRealtimeTicket,
  listConversations,
  replyToConversation,
  sendCustomerMessage,
  updateConversationStatus,
} from "../controllers/messages.controller";
import { authorize, protect } from "../middleware/auth";
import { optionalAuth } from "../middleware/optionalAuth";

const router = Router();
const staff = [protect, authorize("manager", "admin", "superadmin")] as const;

router.get("/conversation", optionalAuth, getMyConversation);
router.post("/conversation/messages", optionalAuth, sendCustomerMessage);
router.post("/realtime-ticket", optionalAuth, getRealtimeTicket);

router.get("/admin/conversations", ...staff, listConversations);
router.get("/admin/conversations/:id", ...staff, getConversationForStaff);
router.post("/admin/conversations/:id/replies", ...staff, replyToConversation);
router.patch("/admin/conversations/:id/status", ...staff, updateConversationStatus);

export default router;
