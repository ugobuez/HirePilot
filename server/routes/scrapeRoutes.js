// routes/scrapeRoutes.js
import express from "express";
import { scrapeAndSaveJobs } from "../controllers/scrapeController.js";

const router = express.Router();

router.post("/scrape-jobs", scrapeAndSaveJobs);

export default router;