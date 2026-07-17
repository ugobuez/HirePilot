import OpenAI from "openai";

// Free OpenRouter API key fallback
const FALLBACK_KEY =
  "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";

const getClient = () => {
  const apiKey = process.env.OPENROUTER_API_KEY || FALLBACK_KEY;
  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://hirepilot.app",
      "X-Title": "HirePilot",
    },
  });
};

/**
 * Send a completion request to OpenRouter's free model tier.
 * @param {string} systemPrompt - System instructions
 * @param {string} userPrompt - User input
 * @param {number} temperature - Creativity (0.0 - 1.0)
 * @returns {Promise<string>} The model's response text
 */
export const openRouterCompletion = async (
  systemPrompt,
  userPrompt,
  temperature = 0.1
) => {
  try {
    const client = getClient();

    const response = await client.chat.completions.create({
      model: "openrouter/free",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
    });

    const text = response.choices[0]?.message?.content || "";
    return text.trim();
  } catch (err) {
    console.error("❌ OpenRouter API error:", err.message);
    throw new Error(`OpenRouter request failed: ${err.message}`);
  }
};

/**
 * Send a completion to OpenRouter and parse the response as JSON.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {number} temperature
 * @returns {Promise<object>} Parsed JSON object
 */
export const openRouterJSON = async (
  systemPrompt,
  userPrompt,
  temperature = 0.1
) => {
  const text = await openRouterCompletion(systemPrompt, userPrompt, temperature);

  // Attempt to extract JSON from the response (strip markdown if needed)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`OpenRouter did not return valid JSON. Raw: ${text}`);
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    throw new Error(`Failed to parse OpenRouter JSON response: ${err.message}`);
  }
};