import express from "express";
import { protect } from "../middleware/auth.js";
import {
  runAutomationPipeline,
  runScanOnly,
  runPreflight,
  setAutoApply,
  runAutoApplyNow,
  getAutoApplyStatus,
  applyToSelectedJobs,
} from "../controllers/automationController.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// POST /api/v1/automation/run - Run full pipeline
router.post("/run", runAutomationPipeline);

// POST /api/v1/automation/scan - Scan only (dry run)
router.post("/scan", runScanOnly);

// GET /api/v1/automation/preflight - Preflight checks only
router.get("/preflight", runPreflight);

// GET  /api/v1/automation/auto-apply - Current settings + remaining limit
// PUT  /api/v1/automation/auto-apply - Toggle + configure
// POST /api/v1/automation/auto-apply - Run now (manual)
// POST /api/v1/automation/auto-apply/jobs - Apply to user-selected jobs
router.get("/auto-apply", getAutoApplyStatus);
router.put("/auto-apply", setAutoApply);
router.post("/auto-apply/run", runAutoApplyNow);
router.post("/auto-apply/jobs", applyToSelectedJobs);

export default router;