// controllers/jobController.js
import { scrapeJobs, getSourcesStatus } from "../middleware/services/scraperService.js";
import { scoreJobsForUser } from "../middleware/services/jobScoreService.js";
import { buildSections } from "../middleware/services/jobSectionService.js";

// GET /api/jobs  — public, paginated, with optional filters
export const getJobs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 24;

    const jobs = await scrapeJobs(req.query);
    const paginated = jobs.slice((page - 1) * limit, page * limit);
    const hasMore = page * limit < jobs.length;

    res.status(200).json({ jobs: paginated, total: jobs.length, page, limit, hasMore });
  } catch (error) {
    console.error("❌ Failed to fetch jobs:", error.message);
    res.status(500).json({ message: "Failed to fetch jobs" });
  }
};

// GET /api/jobs/search — public filtered search with pagination
export const searchJobs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 24;

    const jobs = await scrapeJobs(req.query);
    const paginated = jobs.slice((page - 1) * limit, page * limit);
    const hasMore = page * limit < jobs.length;

    res.status(200).json({
      jobs: paginated,
      total: jobs.length,
      page,
      limit,
      hasMore,
      filters: {
        query: req.query.query || null,
        country: req.query.country || null,
        company: req.query.company || null,
        role: req.query.role || null,
        remote: req.query.remote === "true" || req.query.remote === true || null,
        salary: req.query.salary || null,
        techStack: req.query.techStack || null,
        experienceLevel: req.query.experienceLevel || null,
        visaSponsorship: req.query.visaSponsorship === "true" || req.query.visaSponsorship === true || null,
      },
    });
  } catch (error) {
    console.error("❌ Job search failed:", error.message);
    res.status(500).json({ message: "Failed to fetch jobs" });
  }
};

// GET /api/jobs/sources — public registry metadata
export const getSources = async (req, res) => {
  try {
    res.status(200).json(getSourcesStatus());
  } catch (error) {
    res.status(500).json({ message: "Failed to load sources" });
  }
};

// GET /api/jobs/for-user — auth, scored for this user (paginated)
export const getJobsForUser = async (req, res) => {
  try {
    const user = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 40;

    const allJobs = await scrapeJobs(req.query);
    const scored = await scoreJobsForUser(allJobs, user, { useAI: true });

    const paginated = scored.slice((page - 1) * limit, page * limit);
    const hasMore = page * limit < scored.length;

    res.status(200).json({
      jobs: paginated,
      total: scored.length,
      page,
      limit,
      hasMore,
      dedupedFrom: allJobs.length,
    });
  } catch (error) {
    console.error("❌ Failed to fetch user jobs:", error.message);
    res.status(500).json({ message: "Failed to fetch jobs" });
  }
};

// GET /api/jobs/sections — auth, curated dashboard sections + Recommended For You
export const getJobSections = async (req, res) => {
  try {
    const user = req.user;
    const minAts = user?.settings?.minAts || 70;

    const allJobs = await scrapeJobs(req.query);
    const scored = await scoreJobsForUser(allJobs, user, { useAI: true });
    const { recommended, sections, total } = buildSections(scored, { minAts });

    res.status(200).json({
      recommended,
      sections,
      total,
      minAts,
      sources: getSourcesStatus().total,
    });
  } catch (error) {
    console.error("❌ Failed to build job sections:", error.message);
    res.status(500).json({ message: "Failed to build job sections" });
  }
};
