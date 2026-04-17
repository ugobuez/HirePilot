import OpenAI from "openai";
import { extractResumeText } from "../middleware/upload.js";

export const analyzeJob = async (req, res) => {
  try {
    console.log("✅ Request received");

    if (!req.file) {
      return res.status(400).json({ error: "Resume file is required" });
    }

    const { jobDesc } = req.body;
    if (!jobDesc) {
      return res.status(400).json({ error: "Job description is required" });
    }

    console.log("📁 FILE:", {
      name: req.file.originalname,
      type: req.file.mimetype,
      size: req.file.size,
    });
    console.log("HEADERS:", req.headers["content-type"]);
console.log("FILE:", req.file);
console.log("FILES:", req.files);

    // ✅ Extract resume text locally (no CVParse API needed)
    const resumeText = await extractResumeText(req.file);
    console.log("📄 Resume text extracted, length:", resumeText.length);

    const prompt = `
You are a professional career assistant.

Resume:
${resumeText}

Job Description:
${jobDesc}

Tasks:
1. Generate a professional, ATS-friendly cover letter tailored to this resume
2. Provide a matchScore (0-100) and missingSkills list

Return STRICTLY JSON ONLY with fields:
{
  "coverLetter": "...",
  "matchScore": 0-100,
  "missingSkills": []
}
`;

    const openai = new OpenAI({
      apiKey: process.env.FIREWORKS_API_KEY,
      baseURL: "https://api.fireworks.ai/inference/v1",
    });

    const response = await openai.chat.completions.create({
      model: "accounts/fireworks/models/llama-v3p3-70b-instruct",
      messages: [
        {
          role: "system",
          content: "You are a career assistant. Always respond with strict JSON.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
    });

    const aiText = response.choices[0].message.content;

    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("❌ RAW AI RESPONSE:", aiText);
      throw new Error("Invalid AI response format");
    }

    const parsedAI = JSON.parse(jsonMatch[0]);

    res.json({
      resumeText,   // raw extracted text (useful for debugging)
      ...parsedAI,
    });

  } catch (err) {
    console.error("❌ ANALYZE ERROR:", {
      message: err.message,
      response: err.response?.data,
    });

    res.status(err.response?.status || 500).json({
      error: "AI Analysis failed",
      details: err.response?.data || err.message,
    });
  }
};