import User from "../models/User.js";
import { runAutomation, scanOnly } from "../middleware/services/automationRunner.js";
import {
  runAutoApplyForUser,
  runAutoApplyOnJobs,
} from "../middleware/services/autoApplyService.js";
import { getUserApplicationLimit } from "../middleware/auth.js";

// POST /api/v1/automation/run - Run full automation pipeline
export const runAutomationPipeline = async (req, res) => {
  try {
    const { dryRun = false, maxApplications = 10 } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Start automation in the background - send immediate response
    const resultPromise = runAutomation(req.user._id, { dryRun, maxApplications });

    // For short runs, await; for long runs, could use a job queue
    const result = await resultPromise;

    res.json(result);
  } catch (err) {
    console.error("❌ Automation run error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// POST /api/v1/automation/scan - Run scan-only mode
export const runScanOnly = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const result = await scanOnly(req.user._id);
    res.json(result);
  } catch (err) {
    console.error("❌ Scan-only error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v1/automation/preflight - Run preflight checks only
export const runPreflight = async (req, res) => {
  try {
    const { runPreflightChecks } = await import("../middleware/services/preflightCheck.js");
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const result = await runPreflightChecks(user);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/v1/automation/auto-apply - Toggle + configure auto apply
export const setAutoApply = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const {
      enabled, interval, minAts, dailyLimit, countries, remoteOnly,
      keywords, blacklistCompanies, preferredTitles, employmentTypes, salaryMin, jobBoards,
    } = req.body;

    user.settings = user.settings || {};
    if (typeof enabled === "boolean") user.settings.autoApplyEnabled = enabled;
    if (interval != null) user.settings.autoApplyInterval = interval;
    if (minAts != null) user.settings.minAts = minAts;
    if (dailyLimit != null) user.settings.dailyLimit = dailyLimit;
    if (Array.isArray(countries)) user.settings.countries = countries;
    if (typeof remoteOnly === "boolean") user.settings.remoteOnly = remoteOnly;
    if (Array.isArray(keywords)) user.settings.keywords = keywords;
    if (Array.isArray(blacklistCompanies)) user.settings.blacklistCompanies = blacklistCompanies;
    if (Array.isArray(preferredTitles)) user.settings.preferredTitles = preferredTitles;
    if (Array.isArray(employmentTypes)) user.settings.employmentTypes = employmentTypes;
    if (salaryMin != null) user.settings.salaryMin = salaryMin;
    if (Array.isArray(jobBoards)) user.settings.jobBoards = jobBoards;

    await user.save();
    res.json({ settings: user.settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/v1/automation/auto-apply/run - Manual auto-apply trigger
export const runAutoApplyNow = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const { dryRun = false, maxPerRun = 5 } = req.body || {};
    const result = await runAutoApplyForUser(user, { dryRun, maxPerRun });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v1/automation/auto-apply - Current auto-apply settings + remaining limit
export const getAutoApplyStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const limit = getUserApplicationLimit(user.email);
    const remaining = Math.max(0, limit - (user.dailyApplicationsCount || 0));
    res.json({
      settings: user.settings || {},
      dailyLimit: limit,
      remaining,
      lastAutoApplyAt: user.lastAutoApplyAt || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/v1/automation/auto-apply/jobs - Auto-apply to user-selected jobs
export const applyToSelectedJobs = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const { jobs = [], dryRun = false } = req.body || {};
    const summary = await runAutoApplyOnJobs(user, jobs, { dryRun });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};