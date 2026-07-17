import { scanJobDescription } from "./jobscanService.js";
import { dedupeJobs } from "../../utils/dedupe.js";

// Cap OpenRouter calls per request; the rest use a fast local heuristic so
// every job still shows a meaningful % (never 0% unless genuinely 0).
const MAX_OPENROUTER_SCORES = 12;

const normalize = (arr) => (Array.isArray(arr) ? arr : []);

const localScore = (job, user) => {
  const skills = normalize(user.onboardingDetails?.skillsList).map((s) => s.toLowerCase());
  const text = `${job.title || ""} ${job.description || ""} ${normalize(job.skills).join(" ")}`.toLowerCase();
  let matched = 0;
  for (const s of skills) if (s && text.includes(s)) matched++;
  const score = skills.length ? Math.min(100, Math.round((matched / skills.length) * 100)) : 72;
  return {
    atsScore: score,
    compat: score,
    titleMatch: score,
    experienceMatch: score,
    hardSkills: score,
    educationMatch: score,
    salaryMatch: job.salary && job.salary !== "Not specified" ? 100 : null,
    locationMatch: job.location ? 80 : null,
    strengths: [],
    missingSkills: [],
    reasons: ["Estimated from keyword overlap (fast local match)."],
    mismatchedHardRequirements: false,
  };
};

/**
 * Score a single job for a given user profile.
 */
export const scoreJobForUser = async (job, user, useAI = true) => {
  if (!useAI) return localScore(job, user);
  try {
    const scan = await scanJobDescription(user, job.description || job.title || "");
    const c = scan.categoryScores || {};
    return {
      atsScore: scan.overallScore,
      compat: scan.overallScore,
      titleMatch: c.jobTitle ?? null,
      experienceMatch: c.experience ?? null,
      hardSkills: c.hardSkills ?? null,
      educationMatch: c.education ?? null,
      salaryMatch: job.salary && job.salary !== "Not specified" ? 100 : null,
      locationMatch: job.location ? 85 : null,
      strengths: normalize(scan.matchedSkills),
      missingSkills: normalize(scan.missingSkills),
      reasons: normalize(scan.recommendations),
      mismatchedHardRequirements: !!scan.mismatchedHardRequirements,
    };
  } catch {
    return localScore(job, user);
  }
};

/**
 * Deduplicate + score a list of jobs for a user.
 * @param {object[]} jobs raw job listings
 * @param {object} user Mongoose user (or plain profile)
 * @param {object} opts { useAI, force }
 * @returns {Promise<object[]>} enriched jobs with scoring fields
 */
export const scoreJobsForUser = async (jobs, user, opts = {}) => {
  const { useAI = true } = opts;
  const deduped = dedupeJobs(jobs);

  const scored = [];
  for (let i = 0; i < deduped.length; i++) {
    const job = deduped[i];
    const result = await scoreJobForUser(job, user, useAI && i < MAX_OPENROUTER_SCORES);
    scored.push({
      ...job,
      atsScore: result.atsScore,
      compat: result.compat,
      titleMatch: result.titleMatch,
      experienceMatch: result.experienceMatch,
      hardSkills: result.hardSkills,
      educationMatch: result.educationMatch,
      salaryMatch: result.salaryMatch,
      locationMatch: result.locationMatch,
      strengths: result.strengths,
      missingSkills: result.missingSkills,
      reasons: result.reasons,
      mismatchedHardRequirements: result.mismatchedHardRequirements,
      _duplicateCount: job._duplicateCount || 1,
    });
  }

  // Highest ATS first
  scored.sort((a, b) => (b.atsScore || 0) - (a.atsScore || 0));
  return scored;
};
