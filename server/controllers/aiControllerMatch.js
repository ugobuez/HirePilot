// controllers/aiControllerMatch.js
import Resume from "../models/Resume.js";
import Job from "../models/Job.js";         
import { getAIScore } from "../services/aiService.js";

export const matchJobs = async (req, res) => {
  try {
    const { resumeId } = req.body;

    // Guard: missing resumeId in request body
    if (!resumeId) {
      return res.status(400).json({ error: "resumeId is required" });
    }

    const resume = await Resume.findById(resumeId);

    // Guard: resume not found in DB
    if (!resume) {
      return res.status(404).json({ error: "Resume not found" });
    }

    const existingJobs = await Job.find().limit(10);  // ← use the imported model

    if (existingJobs.length === 0) {
      return res.status(200).json([]);  // return empty array, not a crash
    }

    const scored = await Promise.all(
      existingJobs.map(async (job) => {
        const score = await getAIScore(job, resume.content);
        return { ...job._doc, score };
      })
    );

    // Sort highest score first before sending
    scored.sort((a, b) => b.score - a.score);

    res.json(scored);
  } catch (err) {
    console.error("❌ matchJobs error:", err.message);  // ← log the REAL error
    res.status(500).json({ error: err.message });       // ← expose it during dev
  }
};