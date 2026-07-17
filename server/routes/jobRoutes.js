import express from "express";
import {
  getJobs,
  getJobsForUser,
  getJobSections,
  searchJobs,
  getSources,
} from "../controllers/jobController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.get("/", getJobs);
router.get("/search", searchJobs);
router.get("/sources", getSources);
router.get("/for-user", protect, getJobsForUser);
router.get("/sections", protect, getJobSections);

export default router;
