import { extractPdfText } from "../services/pdfText.js";
import Resume from "../models/Resume.js";

export const uploadResume = async (req, res) => {
  try {
    console.log("📂 File received:", req.file);

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // ✅ FIXED PDF PARSER
    const { text, extractor } = await extractPdfText(req.file.buffer);
    if (!text || text.trim().length < 20) {
      return res.status(422).json({
        error: "Could not read any text from this PDF — it may be a scan or image-only file.",
        extractor,
      });
    }

    const resume = await Resume.create({
      content: text,
    });

    res.json({
      message: "Resume uploaded",
      resumeId: resume._id,
      extractor,
    });
  } catch (err) {
    console.error("❌ Upload error:", err);
    res.status(500).json({ error: err.message });
  }
};