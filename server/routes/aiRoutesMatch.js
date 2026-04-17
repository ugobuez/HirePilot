import express from "express";
import { matchJobs } from "../controllers/aiControllerMatch.js"; 

const router = express.Router();

router.post("/match-jobs", matchJobs);

export default router;