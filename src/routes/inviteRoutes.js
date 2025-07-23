import express from "express";
import {
  acceptInvite,
  deleteInvite,
  getAllSentInvites,
  sendInvite,
} from "../controllers/inviteController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/send-invite", authMiddleware, sendInvite);
router.post("/accept-invite", acceptInvite);
router.get("/all-invites", authMiddleware, getAllSentInvites);
router.delete("/invite/:inviteId", authMiddleware, deleteInvite);

export default router;
