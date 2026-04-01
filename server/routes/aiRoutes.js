import express from "express";
import multer from "multer";
import { analyzeJob } from "../controllers/aiController.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

// Upload a resume + job description
router.post("/analyze", upload.single("resume"), analyzeJob);

export default router;