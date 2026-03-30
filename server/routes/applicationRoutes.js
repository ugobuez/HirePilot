import express from "express";
import { saveApplication, getApplications } from "../controllers/applicationController.js";
import { updateApplicationStatus } from "../controllers/applicationController.js";


const router = express.Router();

// POST /api/applications
router.post("/", saveApplication);

// GET /api/applications
router.get("/", getApplications);
router.put("/:id", updateApplicationStatus);
export default router;