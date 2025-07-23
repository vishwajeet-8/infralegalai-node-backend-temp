import express from "express";
import {
  followCase,
  getFollowedCases,
  getFollowedCasesByCourt,
  unfollowCase,
} from "../controllers/researchController.js";

const router = express.Router();

router.get("/get-followed-cases", getFollowedCases);
router.get("/get-followed-cases-by-court", getFollowedCasesByCourt);
router.post("/follow-case", followCase);
router.delete("/unfollow-case", unfollowCase);

export default router;
