import express from "express";
import { protect } from "../middleware/auth.js";
import {
  createApplication,
  getApplications,
  getApplicationStats,
  updateApplicationStatus,
  updateApplication,
  deleteApplication,
  manualApply,
  runTailor,
} from "../controllers/applicationController.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// GET /api/v1/applications/stats - Pipeline stats (must be before /:id)
router.get("/stats", getApplicationStats);

// POST /api/v1/applications - Create application
router.post("/", createApplication);

// GET /api/v1/applications - List applications
router.get("/", getApplications);

// POST /api/v1/applications/manual-apply - Manual add
router.post("/manual-apply", manualApply);

// POST /api/v1/applications/:id/tailor - Run tailoring
router.post("/:id/tailor", runTailor);

// PUT /api/v1/applications/:id/status - Update status
router.put("/:id/status", updateApplicationStatus);

// PUT /api/v1/applications/:id - Update application
router.put("/:id", updateApplication);

// DELETE /api/v1/applications/:id - Delete application
router.delete("/:id", deleteApplication);

export default router;