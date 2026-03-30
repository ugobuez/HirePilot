import { scrapeJobs } from "../services/scraperService.js";

export const getJobs = async (req, res) => {
  try {
    const jobs = await scrapeJobs();
    res.json(jobs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
};


export const updateApplicationStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const updated = await Application.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    res.json(updated);
  } catch (err) {
    console.error("❌ Update error:", err.message);
    res.status(500).json({ error: "Failed to update status" });
  }
};