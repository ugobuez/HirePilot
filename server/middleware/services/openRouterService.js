import { complete, completeJson } from "../../services/llmRouter.js";
import { z } from "zod";

/**
 * Compatibility adapter for the old OpenRouter-only helper.
 *
 * Every call now goes through the LLM router, which:
 *  - tries the configured free tiers (Groq -> OpenRouter -> Gemini),
 *  - skips providers without a key instead of crashing,
 *  - rate-limits, retries, caches, and never uses a hardcoded or paid key.
 *
 * The signatures are unchanged so existing callers keep working.
 */

/**
 * Send a completion request through the free-tier provider chain.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {number} temperature
 * @returns {Promise<string>} the model's response text
 */
export const openRouterCompletion = async (systemPrompt, userPrompt, temperature = 0.1) => {
  const res = await complete(systemPrompt, userPrompt, { tier: "large", temperature });
  if (!res.text || res.source === "none") {
    throw new Error(
      "No LLM provider available — set GROQ_API_KEY, OPENROUTER_API_KEY or GEMINI_API_KEY (all have free tiers)"
    );
  }
  return String(res.text).trim();
};

/**
 * Send a completion and parse the answer as JSON.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {number} temperature
 * @returns {Promise<object>} parsed JSON object
 */
export const openRouterJSON = async (systemPrompt, userPrompt, temperature = 0.1) => {
  // The router repairs malformed JSON locally and requests native JSON mode
  // where the provider supports it, so this no longer depends on the model
  // remembering to emit a bare object.
  const res = await completeJson(
    systemPrompt,
    userPrompt,
    z.record(z.string(), z.unknown()),
    null,
    { tier: "large", temperature, maxCalls: 1 }
  );
  if (res.source !== "llm" || !res.data || typeof res.data !== "object") {
    const reasons = (res.errors || []).map((e) => e.errorType).filter(Boolean).join(", ") || "no usable JSON";
    throw new Error(`LLM (${res.provider || "none"}) returned no usable JSON: ${reasons}`);
  }
  return res.data;
};

export default { openRouterCompletion, openRouterJSON };
