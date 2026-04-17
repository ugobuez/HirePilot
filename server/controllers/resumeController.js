import pdf from "pdf-parse-fixed";
import Resume from "../models/Resume.js";

export const uploadResume = async (req, res) => {
  try {
    console.log("📂 File received:", req.file);

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // ✅ FIXED PDF PARSER
    const data = await pdf(req.file.buffer);

    console.log("📄 Extracted text length:", data.text.length);

    const resume = await Resume.create({
      content: data.text,
    });

    res.json({
      message: "Resume uploaded",
      resumeId: resume._id,
    });
  } catch (err) {
    console.error("❌ Upload error:", err);
    res.status(500).json({ error: err.message });
  }
};