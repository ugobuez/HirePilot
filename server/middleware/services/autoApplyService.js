import { scrapeJobs } from "./scraperService.js";
import { scoreJobsForUser } from "./jobScoreService.js";
import { tailorForJob } from "./tailorService.js";
import { getUserApplicationLimit } from "../auth.js";
import Application from "../../models/Application.js";
import User from "../../models/User.js";
import { getCached, setCached } from "../../utils/jobCache.js";

/**
 * Apply a single job for a user: tailor resume + cover letter (hallucination-safe)
 * and persist an Application record. Increments the user's daily count.
 * @returns {Promise<object>} { title, company, status, ats }
 */
const applyOneJob = async (user, job, dryRun) => {
  const company = job.company || "Unknown";
  const title = job.title || "Unknown";

  if (dryRun) {
    return { title, company, status: "Skipped (dry run)", ats: job.atsScore };
  }

  const scanResult = {
    missingKeywords: job.missingSkills || [],
    matchedSkills: job.strengths || [],
    overallScore: job.atsScore,
  };
  const tailored = await tailorForJob(user, scanResult, job.description || title, title, company);

  await Application.create({
    userId: user._id,
    jobTitle: title,
    company,
    location: job.location || "",
    jobDescription: job.description || "",
    source: job.source || "Auto",
    salary: job.salary || "",
    status: "Applied",
    matchRate: job.atsScore,
    tailoredResumeText: tailored.tailoredResumeText,
    coverLetterText: tailored.coverLetterText,
    appliedAt: new Date(),
    history: [
      { status: "Scraped", changedAt: new Date(), note: "Job discovered via auto-apply" },
      { status: "Tailored", changedAt: new Date(), note: `ATS ${job.atsScore}%` },
      { status: "Applied", changedAt: new Date(), note: "Auto-applied (simulated submission)" },
    ],
  });

  user.dailyApplicationsCount = (user.dailyApplicationsCount || 0) + 1;
  user.lastAppliedDate = new Date();
  await user.save();

  return { title, company, status: "Applied", ats: job.atsScore };
};

/**
 * Run the auto-apply pipeline for a single user across the full job pool:
 *   scrape (cached) -> dedupe -> score -> filter by min ATS -> tailor -> save.
 */
export const runAutoApplyForUser = async (user, opts = {}) => {
  const { dryRun = false, maxPerRun = 5 } = opts;
  const settings = user.settings || {};
  const minAts = settings.minAts ?? 70;

  const summary = {
    startedAt: new Date().toISOString(),
    dryRun,
    minAts,
    found: 0,
    eligible: 0,
    applied: 0,
    skipped: 0,
    errors: [],
    jobs: [],
  };

  try {
    const cacheKey = "jobs:all";
    let jobs = getCached(cacheKey);
    if (!jobs) {
      jobs = await scrapeJobs();
      setCached(cacheKey, jobs, 10 * 60 * 1000);
    }
    const scored = await scoreJobsForUser(jobs, user, { useAI: true });
    summary.found = scored.length;

    const limit = getUserApplicationLimit(user.email);
    const remaining = Math.max(0, limit - (user.dailyApplicationsCount || 0));
    const eligible = scored
      .filter((j) => (j.atsScore || 0) >= minAts && !j.mismatchedHardRequirements)
      .slice(0, Math.min(maxPerRun, remaining));

    summary.eligible = eligible.length;

    for (const job of eligible) {
      try {
        const r = await applyOneJob(user, job, dryRun);
        if (dryRun) summary.skipped++;
        else summary.applied++;
        summary.jobs.push(r);
      } catch (err) {
        summary.errors.push(`${job.title}: ${err.message}`);
      }
    }

    summary.completedAt = new Date().toISOString();
    return summary;
  } catch (err) {
    summary.errors.push(err.message);
    summary.completedAt = new Date().toISOString();
    return summary;
  }
};

/**
 * Auto-apply to a specific set of jobs (e.g. user-selected from the board).
 * Scores the supplied jobs for the user, keeps only those above min ATS with no
 * hard mismatch, and respects the daily application limit.
 *
 * @param {object} user Mongoose User document
 * @param {object[]} jobs raw job objects (need title/company/description/source...)
 * @param {object} opts { dryRun }
 */
export const runAutoApplyOnJobs = async (user, jobs = [], opts = {}) => {
  const { dryRun = false } = opts;
  const settings = user.settings || {};
  const minAts = settings.minAts ?? 70;

  const summary = {
    startedAt: new Date().toISOString(),
    dryRun,
    minAts,
    found: jobs.length,
    eligible: 0,
    applied: 0,
    skipped: 0,
    errors: [],
    jobs: [],
  };

  try {
    if (!Array.isArray(jobs) || jobs.length === 0) {
      summary.completedAt = new Date().toISOString();
      return summary;
    }

    const scored = await scoreJobsForUser(jobs, user, { useAI: true });
    const limit = getUserApplicationLimit(user.email);
    const remaining = Math.max(0, limit - (user.dailyApplicationsCount || 0));

    const eligible = scored
      .filter((j) => (j.atsScore || 0) >= minAts && !j.mismatchedHardRequirements)
      .slice(0, remaining);

    summary.eligible = eligible.length;

    for (const job of eligible) {
      try {
        const r = await applyOneJob(user, job, dryRun);
        if (dryRun) summary.skipped++;
        else summary.applied++;
        summary.jobs.push(r);
      } catch (err) {
        summary.errors.push(`${job.title}: ${err.message}`);
      }
    }

    summary.completedAt = new Date().toISOString();
    return summary;
  } catch (err) {
    summary.errors.push(err.message);
    summary.completedAt = new Date().toISOString();
    return summary;
  }
};

/**
 * Process every user that has auto-apply enabled and is due for a run.
 * Called by the server-side scheduler.
 */
export const processAutoApplyQueue = async () => {
  try {
    const users = await User.find({ "settings.autoApplyEnabled": true });
    for (const user of users) {
      const intervalMin = user.settings?.autoApplyInterval || 30;
      const last = user.lastAutoApplyAt ? new Date(user.lastAutoApplyAt).getTime() : 0;
      const due = Date.now() - last >= intervalMin * 60 * 1000;
      if (!due) continue;
      user.lastAutoApplyAt = new Date();
      await user.save();
      await runAutoApplyForUser(user, { dryRun: false, maxPerRun: 5 });
    }
  } catch (err) {
    console.error("❌ Auto-apply queue error:", err.message);
  }
};
