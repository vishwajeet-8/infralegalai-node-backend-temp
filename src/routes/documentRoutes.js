import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  deleteFile,
  geminiFileUri,
  getSignedUrlForFile,
  listFiles,
  uploadDocument,
} from "../controllers/documentController.js";
import multer from "multer";
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });
router.post(
  "/upload-documents",
  authMiddleware,
  upload.array("files"),
  uploadDocument
);

router.get("/list-documents/:workspaceId", listFiles);
router.delete("/delete-document/:fileId", deleteFile);
router.get("/get-signed-url", authMiddleware, getSignedUrlForFile);
router.post("/gemini-uri", upload.array("files"), geminiFileUri);
export default router;
