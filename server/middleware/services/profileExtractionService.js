import { z } from "zod";
import { completeJson } from "../../services/llmRouter.js";
import { parseResumeLocal } from "../../services/resumeParser.js";
import logger from "../../utils/logger.js";

/**
 * Resume -> candidate profile.
 *
 * fastParse ON  : deterministic local parse only. No LLM call at all.
 * fastParse OFF : local parse + AT MOST ONE LLM call (maxCalls: 1) whose JSON
 *                 is validated against a schema. No repair call, no second
 *                 "write me a summary" call — those used to double the cost of a
 *                 single upload and were the reason extraction was flaky.
 */

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

const yearsFromExperience = (jobs = []) => {
  const thisYear = new Date().getFullYear();
  const yearOf = (value) => Number(String(value || "").match(/\b(19|20)\d{2}\b/)?.[0]);
  let total = 0;
  for (const job of jobs) {
    const start = yearOf(job.start);
    const end = job.present ? thisYear : yearOf(job.end);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) total += end - start;
  }
  return Math.min(total, 60);
};

/** Deterministic profile built from the local parser (the fastParse ON answer). */
export const localProfileFrom = (resumeText) => {
  const parsed = parseResumeLocal(String(resumeText || ""));
  const years = yearsFromExperience(parsed.experience);
  return {
    ...DEFAULT_PROFILE,
    fullName: parsed.name || "",
    email: parsed.email || "",
    phone: parsed.phone || "",
    location: parsed.location || "",
    yearsOfExperience: years,
    totalExperienceYears: years,
    education: parsed.education || [],
    skills: parsed.skills || [],
    projects: parsed.projects || [],
    certifications: parsed.certifications || [],
    summary: parsed.summary || "",
  };
};

const profileSchema = z
  .object({
    fullName: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    country: z.string().optional(),
    location: z.string().optional(),
    yearsOfExperience: z.number().optional(),
    totalExperienceYears: z.number().optional(),
    education: z.array(z.string()).optional(),
    skills: z.array(z.string()).optional(),
    projects: z.array(z.string()).optional(),
    certifications: z.array(z.string()).optional(),
    preferredTitles: z.array(z.string()).optional(),
    isAuthorizedToWorkInUS: z.boolean().optional(),
    linkedInUrl: z.string().optional(),
    gitHubUrl: z.string().optional(),
    personalWebsite: z.string().optional(),
    summary: z.string().optional(),
  })
  // An empty object is not an enrichment: reject it so the chain fails over
  // instead of silently returning the local profile as an "AI" result.
  .refine((d) => Boolean(d.summary || (d.skills || []).length), { message: "empty extraction" });

/** Keep only structured facts that actually appear in the resume text. */
const grounded = (values, haystack) =>
  (values || []).filter((v) => haystack.includes(String(v).toLowerCase().trim()));

const pickGrounded = (values, haystack, localValues) => {
  const safe = grounded(values, haystack);
  return safe.length ? safe : localValues;
};

const SYSTEM_PROMPT = `You are an expert resume parser. Extract structured candidate information from the resume text and return STRICTLY valid JSON (no markdown, no code fences) matching this schema:
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

/**
 * Extract a structured candidate profile from resume text.
 *
 * @param {string} resumeText
 * @param {{fastParse?: boolean, userId?: string}} options
 * @returns {Promise<{profile: object, meta: object}>}
 */
export const extractProfileFromResume = async (resumeText, { fastParse = true, userId } = {}) => {
  const started = Date.now();
  const local = localProfileFrom(resumeText);

  // fastParse ON: local parsing only, guaranteed zero provider calls.
  if (fastParse) {
    return { profile: local, meta: { mode: "local", llmCalls: 0, source: "local", ms: Date.now() - started } };
  }

  const res = await completeJson(
    SYSTEM_PROMPT,
    `RESUME TEXT:\n${String(resumeText).slice(0, 8000)}`,
    profileSchema,
    () => local,
    { tier: "large", temperature: 0.1, maxTokens: 1200, userId, maxCalls: 1 }
  );

  const data = res.data || {};
  const haystack = String(resumeText).toLowerCase();
  const profile = {
    ...local,
    ...data,
    // Truthfulness guard: structured facts must exist in the text.
    skills: pickGrounded(data.skills, haystack, local.skills),
    education: pickGrounded(data.education, haystack, local.education),
    certifications: pickGrounded(data.certifications, haystack, local.certifications),
    fullName: data.fullName || local.fullName,
    email: data.email || local.email,
    phone: data.phone || local.phone,
    location: data.location || local.location,
    summary: data.summary || local.summary,
  };

  if (res.source !== "llm" && res.errors?.length) {
    // Metadata only: no resume content, no credentials.
    logger.warn("profile extraction fell back to local", {
      source: res.source,
      reasons: res.errors,
      ms: Date.now() - started,
    });
  }

  return {
    profile,
    meta: {
      mode: res.source === "llm" ? "local+llm" : "local-only",
      llmCalls: res.source === "llm" ? 1 : 0,
      source: res.source,
      provider: res.provider,
      model: res.model,
      ms: Date.now() - started,
    },
  };
};

/**
 * Professional summary from an already-extracted profile.
 *
 * Note: this is a LOCAL formatter. It used to make its own LLM call, which is
 * why one /extract-resume request used to hit the provider twice. Callers that
 * already have a profile get their summary for free.
 */
export const generateProfessionalSummary = (profile) => {
  const existing = String(profile?.summary || "").trim();
  if (existing) return existing;
  const title = profile?.preferredTitles?.[0] || profile?.fullName || "Candidate";
  const years = Number(profile?.yearsOfExperience || profile?.totalExperienceYears || 0);
  const skills = (profile?.skills || []).slice(0, 5).join(", ");
  const parts = [`${title}${years ? ` with ${years} years of experience` : ""}.`];
  if (skills) parts.push(`Core skills: ${skills}.`);
  if (profile?.location) parts.push(`Based in ${profile.location}.`);
  return parts.join(" ");
};

