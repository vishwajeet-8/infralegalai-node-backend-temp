import express from "express";
import {
  extractedDataById,
  extractedDataByWorkspace,
  saveExtraction,
} from "../controllers/extractionController.js";

const router = express.Router();

router.post("/save-extraction", saveExtraction);
router.get("/extracted-data-workspace/:workspaceId", extractedDataByWorkspace);
router.get("/extracted-data-id/:id", extractedDataById);

export default router;
