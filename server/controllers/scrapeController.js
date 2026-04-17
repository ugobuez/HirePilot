// controllers/scrapeController.js
import { scrapeJobsFromApify } from "../services/apifyService.js";
import Job from "../models/Job.js";

export const scrapeAndSaveJobs = async (req, res) => {
  try {
    const { locations, keyword } = req.body;

    const jobs = await scrapeJobsFromApify(locations, keyword);

    await Job.deleteMany({});
    await Job.insertMany(jobs);

    res.json({ message: `Saved ${jobs.length} jobs`, jobs });

  } catch (err) {
    console.error("❌ Scrape error:", err.message);
    res.status(500).json({ error: err.message });
  }
};