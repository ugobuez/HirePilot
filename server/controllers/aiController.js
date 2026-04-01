// server/controllers/aiController.js
import axios from "axios";
import OpenAI from "openai";
import FormData from "form-data";

export const analyzeJob = async (req, res) => {
  try {
    console.log("✅ Request received");

    if (!req.file)
      return res.status(400).json({ error: "Resume file is required" });

    const { jobDesc } = req.body;
    if (!jobDesc)
      return res.status(400).json({ error: "Job description is required" });

    // Send resume buffer to CVParse
    const formData = new FormData();
    formData.append("file", req.file.buffer, req.file.originalname);

    const cvParseResp = await axios.post(
      "https://api.cvparse.io/api/v1/parse",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          "X-API-Key": process.env.CVPARSE_API_KEY,
        },
      }
    );

    const parsedResume = cvParseResp.data; // structured JSON

    // AI prompt
    const prompt = `
You are a professional career assistant.

Resume JSON:
${JSON.stringify(parsedResume)}

Job Description:
${jobDesc}

Tasks:
1. Generate a professional, ATS-friendly cover letter tailored to this resume
2. Provide a matchScore (0-100) and missingSkills list

Return STRICTLY JSON ONLY with fields: {coverLetter: "...", matchScore: 0-100, missingSkills: []}
`;

    const openai = new OpenAI({
      apiKey: process.env.FIREWORKS_API_KEY,
      baseURL: "https://api.fireworks.ai/inference/v1",
    });

    const response = await openai.chat.completions.create({
      model: "accounts/fireworks/models/llama-v3p3-70b-instruct",
      messages: [
        { role: "system", content: "You are a career assistant. Always respond with strict JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
    });

    const aiText = response.choices[0].message.content;
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) throw new Error("Invalid AI response format");

    res.json({
      parsedResume,
      ...JSON.parse(jsonMatch[0]),
    });

  } catch (err) {
    console.error("❌ ANALYZE ERROR:", err.response?.data || err.message);
    res.status(err.status || 500).json({
      error: "AI Analysis failed",
      details: err.response?.data || err.message,
    });
  }
};