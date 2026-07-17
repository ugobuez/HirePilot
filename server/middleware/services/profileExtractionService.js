import { openRouterJSON } from "./openRouterService.js";

export const DEFAULT_PROFILE = {
  fullName: "",
  email: "",
  phone: "",
  country: "",
  location: "",
  yearsOfExperience: 0,
  education: [],
  skills: [],
  projects: [],
  certifications: [],
  preferredTitles: [],
  isAuthorizedToWorkInUS: false,
  linkedInUrl: "",
  gitHubUrl: "",
  personalWebsite: "",
  summary: "",
  totalExperienceYears: 0,
};

/**
 * Parse a raw resume text into a structured candidate profile using OpenRouter.
 * Returns a normalized profile object (falls back to defaults on failure).
 *
 * @param {string} resumeText
 * @returns {Promise<object>}
 */
export const extractProfileFromResume = async (resumeText) => {
  const systemPrompt = `You are an expert resume parser. Extract structured candidate information from the resume text and return STRICTLY valid JSON (no markdown, no code fences) matching this schema:
{
  "fullName": string,
  "email": string,
  "phone": string,
  "country": string,
  "location": string,
  "yearsOfExperience": number,
  "totalExperienceYears": number,
  "education": [string],
  "skills": [string],
  "projects": [string],
  "certifications": [string],
  "preferredTitles": [string],
  "isAuthorizedToWorkInUS": boolean,
  "linkedInUrl": string,
  "gitHubUrl": string,
  "personalWebsite": string,
  "summary": string
}
Rules:
- Only extract information that is explicitly present in the resume. Do not invent.
- Use empty string/array/false for anything missing.
- "skills" should be a clean list of technical and soft skills.
- "preferredTitles" should be inferred job titles the candidate is suited for.
- "summary" is a 2-3 sentence professional summary derived from the resume.`;

  const userPrompt = `RESUME TEXT:\n${resumeText}`;

  try {
    const parsed = await openRouterJSON(systemPrompt, userPrompt, 0.1);
    return { ...DEFAULT_PROFILE, ...parsed };
  } catch (err) {
    console.error("❌ Profile extraction failed:", err.message);
    return { ...DEFAULT_PROFILE };
  }
};

/**
 * Generate a concise professional summary for a candidate from their profile.
 */
export const generateProfessionalSummary = async (profile) => {
  try {
    const system = "You are a career coach. Write a tight 2-3 sentence professional summary.";
    const user = `Profile: ${JSON.stringify(profile)}`;
    const summary = await (await import("./openRouterService.js")).openRouterCompletion(system, user, 0.3);
    return summary?.trim() || profile.summary || "";
  } catch {
    return profile.summary || "";
  }
};
