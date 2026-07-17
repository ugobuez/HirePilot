// controllers/scrapeController.js
import { scrapeJobs } from "../middleware/services/scraperService.js";
import Job from "../models/Job.js";

export const scrapeAndSaveJobs = async (req, res) => {
  try {
    const jobs = await scrapeJobs(req.query || {});

    let saved = 0;
    for (const job of jobs) {
      const filter = job.id
        ? { externalId: job.id }
        : { title: job.title, company: job.company, location: job.location };

      const set = { ...job, externalId: job.id };
      delete set.id;

      const result = await Job.updateOne(filter, { $set: set }, { upsert: true });
      if (result.upsertedCount || result.modifiedCount) saved++;
    }

    res.json({ message: `Saved ${saved}/${jobs.length} jobs`, total: jobs.length, saved });
  } catch (err) {
    console.error("❌ Scrape error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
