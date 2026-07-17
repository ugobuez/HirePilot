/**
 * Resume & Cover Letter Tailoring Service
 * Uses OpenRouter to rewrite resumes and generate cover letters
 * that match target job descriptions.
 *
 * HALLUCINATION PROTECTION:
 * - Strict anti-hallucination directive enforced in prompts
 * - Only adds skills/technologies explicitly present in the user's base profile
 * - Keeps dates, job titles, company names 100% accurate
 * - Never fabricates experience, credentials, or metrics
 */

import { openRouterCompletion } from "./openRouterService.js";

/**
 * Tailor a resume to match a target job description.
 * Rewrites summaries and experience bullet points to integrate missing keywords
 * while keeping dates and job titles 100% accurate.
 *
 * @param {string} baseResumeText - User's master resume text
 * @param {string[]} missingKeywords - Keywords to integrate from jobscan
 * @param {string} jobDescription - Target job description
 * @param {string} targetJobTitle - The job title to use (dynamic title alignment)
 * @returns {Promise<string>} Tailored resume text
 */
export const tailorResume = async (
  baseResumeText,
  missingKeywords,
  jobDescription,
  targetJobTitle
) => {
  try {
    const systemPrompt = `You are an expert ATS resume writer. Your job is to rewrite a resume to maximize its match rate against a target job description.

## CRITICAL RULES - YOU MUST FOLLOW THESE STRICTLY:

1. ANTI-HALLUCINATION DIRECTIVE: You are strictly prohibited from:
   - Adding technologies, languages, frameworks, or tools that are not explicitly present in the user's base resume
   - Inventing fake job titles, company names, dates, or credentials
   - Fabricating metrics, percentages, or quantitative results
   - Adding degrees, certifications, or education that the user doesn't have
   - Creating entire job positions that don't exist in the original resume

2. You CAN change: presentation format, vocabulary choice, bullet point structure, and emphasis based on the target job.

3. Keep ALL dates, job titles, company names, and education credentials 100% ACCURATE.

4. Rewrite experience bullet points using the formula: Action Verb + Task + Tool + Result (Metric) — BUT only if the metric exists in the original resume. Never fabricate numbers.

5. Integrate the missing keywords naturally into summaries and experience descriptions, but only if the user actually has related experience.

6. Change the resume's target/title to exactly match the target job title provided.

7. Use industry-standard acronyms with spell-outs (e.g., "Search Engine Optimization (SEO)").

8. Do NOT add skills or experience the candidate doesn't actually have.

9. Return the FULL rewritten resume text.`;

    const userPrompt = `TARGET JOB TITLE: ${targetJobTitle}

MISSING KEYWORDS TO INTEGRATE (only if experience justifies it): ${missingKeywords.join(", ")}

JOB DESCRIPTION:
${jobDescription}

MASTER RESUME (DO NOT INVENT SKILLS OR EXPERIENCE NOT LISTED HERE):
${baseResumeText}

Rewrite this resume to maximize ATS match for the target role. Return the complete rewritten resume. STRICTLY adhere to the anti-hallucination rules above.`;

    const tailored = await openRouterCompletion(systemPrompt, userPrompt, 0.2);
    return tailored;
  } catch (err) {
    console.error("❌ tailorResume error:", err.message);
    throw new Error(`Resume tailoring failed: ${err.message}`);
  }
};

/**
 * Generate a professional 3-paragraph cover letter for a target role.
 *
 * @param {string} userName - User's full name
 * @param {string} targetJobTitle - Target job title
 * @param {string} companyName - Target company name
 * @param {string} baseResumeText - User's resume for context
 * @param {string} jobDescription - Target job description
 * @returns {Promise<string>} Generated cover letter text
 */
export const generateCoverLetter = async (
  userName,
  targetJobTitle,
  companyName,
  baseResumeText,
  jobDescription
) => {
  try {
    const systemPrompt = `You are a professional cover letter writer. Generate a highly personalized, professional 3-paragraph cover letter.

## CRITICAL RULES:
1. ANTI-HALLUCINATION: Do NOT invent skills, experiences, or qualifications not present in the user's resume.
2. Address the specific role and company.
3. First paragraph: Introduction expressing interest and fit based on ACTUAL experience.
4. Second paragraph: Highlight key achievements from the resume that are relevant.
5. Third paragraph: Closing with call to action and enthusiasm.
6. Keep it concise, professional, and tailored.
7. Do not include placeholders like [Your Name] - use the actual name provided.
8. Return only the cover letter text, no additional commentary.`;

    const userPrompt = `Write a cover letter for:

NAME: ${userName}
TARGET ROLE: ${targetJobTitle}
COMPANY: ${companyName || "the company"}

RESUME CONTEXT (base all claims on this):
${baseResumeText}

JOB DESCRIPTION:
${jobDescription}

Generate a professional 3-paragraph cover letter. Do NOT fabricate any skills or experience.`;

    const coverLetter = await openRouterCompletion(systemPrompt, userPrompt, 0.3);
    return coverLetter;
  } catch (err) {
    console.error("❌ generateCoverLetter error:", err.message);
    throw new Error(`Cover letter generation failed: ${err.message}`);
  }
};

/**
 * Full tailoring pipeline: generates tailored resume + cover letter.
 *
 * @param {object} user - User document with onboardingDetails and baseResumeText
 * @param {object} jobScanResult - Result from jobscanService.scanJobDescription
 * @param {string} jobDescription - Raw job description text
 * @param {string} targetJobTitle - Dynamic job title for alignment
 * @param {string} companyName - Company name for cover letter
 * @returns {Promise<{tailoredResumeText: string, coverLetterText: string}>}
 */
export const tailorForJob = async (
  user,
  jobScanResult,
  jobDescription,
  targetJobTitle,
  companyName
) => {
  const missingKeywords = jobScanResult.missingKeywords || [];
  const userName = user.onboardingDetails?.fullName || "Applicant";

  console.log(`✂️ Tailoring resume for "${targetJobTitle}"...`);

  const [tailoredResumeText, coverLetterText] = await Promise.all([
    tailorResume(
      user.baseResumeText,
      missingKeywords,
      jobDescription,
      targetJobTitle
    ),
    generateCoverLetter(
      userName,
      targetJobTitle,
      companyName,
      user.baseResumeText,
      jobDescription
    ),
  ]);

  return {
    tailoredResumeText,
    coverLetterText,
  };
};

export default {
  tailorResume,
  generateCoverLetter,
  tailorForJob,
};