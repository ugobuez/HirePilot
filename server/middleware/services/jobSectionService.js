/**
 * Dashboard section builder.
 *
 * Takes the (already user-scored) job list and groups it into the curated
 * dashboard sections required by the product:
 *   🔥 Recommended For You (above the user's min ATS score)
 *   🔥 Top Remote Jobs, 🇳🇬 Nigeria Friendly, 🎓 Graduate Programs,
 *   💼 Internships, 🚀 Startup Jobs, 🏢 Big Tech, 💰 Highest Paying,
 *   ⚡ Easy Apply, 🟢 Hiring Now, ⭐ 90%+ Match
 *
 * Each returned job also carries `matchScore` (ATS if scored, else quality)
 * and `sections` (which sections it belongs to) for UI badges.
 */
import { classifySections } from "./jobNormalize.js";

export const SECTION_META = {
  "top-remote": { id: "top-remote", title: "🔥 Top Remote Jobs", subtitle: "Work from anywhere" },
  "nigeria-friendly": { id: "nigeria-friendly", title: "🇳🇬 Nigeria Friendly", subtitle: "Hiring in Africa & Nigeria" },
  graduate: { id: "graduate", title: "🎓 Graduate Programs", subtitle: "New-grad & trainee roles" },
  internships: { id: "internships", title: "💼 Internships", subtitle: "Internship openings" },
  startup: { id: "startup", title: "🚀 Startup Jobs", subtitle: "High-growth startups" },
  "big-tech": { id: "big-tech", title: "🏢 Big Tech", subtitle: "Household-name tech" },
  "highest-paying": { id: "highest-paying", title: "💰 Highest Paying", subtitle: "Roles with disclosed salary" },
  "easy-apply": { id: "easy-apply", title: "⚡ Easy Apply", subtitle: "One-click applications" },
  "hiring-now": { id: "hiring-now", title: "🟢 Hiring Now", subtitle: "Posted in the last 7 days" },
  "top-match": { id: "top-match", title: "⭐ 90%+ Match", subtitle: "Top resume matches" },
};

const SECTION_ORDER = [
  "top-remote",
  "nigeria-friendly",
  "graduate",
  "internships",
  "startup",
  "big-tech",
  "highest-paying",
  "easy-apply",
  "hiring-now",
  "top-match",
];

const withMeta = (job) => {
  const matchScore = job.atsScore != null ? job.atsScore : job.qualityScore || 0;
  const sections = Object.entries(classifySections(job))
    .filter(([, v]) => v)
    .map(([k]) => k);
  return { ...job, matchScore, sections };
};

/**
 * @param {object[]} jobs already normalized (and ideally ATS-scored)
 * @param {object} [opts] { minAts = 70, limit = 14 }
 * @returns {object} { recommended, sections, total, dedupedFrom }
 */
export const buildSections = (jobs = [], opts = {}) => {
  const { minAts = 70, limit = 14 } = opts;
  const enriched = jobs.map(withMeta);
  const total = enriched.length;

  // 🔥 Recommended For You — only jobs above the user's minimum ATS score
  const recommended = enriched
    .filter((j) => (j.atsScore != null ? j.atsScore : j.qualityScore || 0) >= minAts)
    .sort((a, b) => (b.atsScore ?? b.qualityScore) - (a.atsScore ?? a.qualityScore));

  const sections = SECTION_ORDER.map((id) => {
    const meta = SECTION_META[id];
    const list = enriched
      .filter((j) => classifySections(j)[id])
      .sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0) || (b.matchScore || 0) - (a.matchScore || 0));
    return { ...meta, count: list.length, jobs: list.slice(0, limit) };
  }).filter((s) => s.count > 0);

  return { recommended, sections, total, dedupedFrom: total };
};

export default buildSections;
