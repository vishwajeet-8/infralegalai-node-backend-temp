import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  createWorkspace,
  deleteWorkspace,
  getSeatUsage,
  listUserWorkspaces,
} from "../controllers/workspaceController.js";

const router = express.Router();

router.get("/seat-usage", authMiddleware, getSeatUsage);
router.post("/workspaces", authMiddleware, createWorkspace);
router.get("/get-workspaces", authMiddleware, listUserWorkspaces);
router.delete("/workspace/:workspaceId", authMiddleware, deleteWorkspace);

export default router;
