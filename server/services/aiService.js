import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();



const client = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY,
  baseURL: "https://api.fireworks.ai/inference/v1",
});

export const getAIScore = async (job, cvText) => {
  const prompt = `
Score this job vs CV from 1-10.

Be strict:
- 10 = perfect match
- 5 = average
- 1 = poor

Job:
${job.title}
${job.description}

CV:
${cvText}

Return ONLY a number.
`;

  const res = await client.chat.completions.create({
    model: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    messages: [
      { role: "system", content: "Return only a number." },
      { role: "user", content: prompt },
    ],
    temperature: 0,
  });

  const text = res.choices[0].message.content.trim();

  return parseFloat(text.replace(/[^\d.]/g, "")); // safer parsing
};