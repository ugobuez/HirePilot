// controllers/jobController.js
import { scrapeJobs } from "../services/scraperService.js";

export const getJobs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = 10; // number of jobs per page

    const allJobs = await scrapeJobs();

    const paginatedJobs = allJobs.slice((page - 1) * pageSize, page * pageSize);
    const hasMore = page * pageSize < allJobs.length;

    res.status(200).json({ jobs: paginatedJobs, hasMore });
  } catch (error) {
    console.error("❌ Failed to fetch jobs:", error.message);
    res.status(500).json({ message: "Failed to fetch jobs" });
  }
};