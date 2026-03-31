import OpenAI from "openai";

export const analyzeJob = async (req, res) => {
  try {
    console.log("✅ Request received");

    const openai = new OpenAI({
      apiKey: process.env.FIREWORKS_API_KEY,
      baseURL: "https://api.fireworks.ai/inference/v1/chat/completions",
    });

    const { jobDesc } = req.body;
    
    if (!jobDesc) {
      return res.status(400).json({ error: "Job description is required" });
    }

    const prompt = `Analyze this job. Return ONLY JSON: {"matchScore": number, "missingSkills": [], "coverLetter": ""}. \nJob: ${jobDesc}`;

    const response = await openai.chat.completions.create({
      
      model: "accounts/fireworks/models/llama-v3p3-70b-instruct", 
      messages: [
        { role: "system", content: "You are a career assistant. Response must be strictly JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
    }).catch(async (err) => {
        console.warn("⚠️ Trying 70B Fallback...");
        return await openai.chat.completions.create({
            model: "accounts/fireworks/models/llama-v3p1-70b-instruct",
            messages: [{ role: "user", content: prompt }],
        });
    });

    const aiText = response.choices[0].message.content;
    const jsonMatch = aiText.match(/\{[\s\S]*\}/); // Extracts just the JSON
    
    if (!jsonMatch) throw new Error("Invalid AI format");

    res.json(JSON.parse(jsonMatch[0]));

  } catch (err) {
    console.error("❌ ANALYZE ERROR:", err.message);
    res.status(err.status || 500).json({
      error: "AI Analysis failed",
      details: err.message
    });
  }
};