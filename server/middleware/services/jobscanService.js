/**
 * In-House JobScan Matching Service
 * Hybrid approach: OpenRouter LLM for semantic parsing/scoring,
 * backed by a resilient local JavaScript fallback algorithm.
 *
 * Scoring Matrix:
 *   Keyword Match       35%
 *   Job Title Match     10%
 *   Experience Match    15%
 *   Education Match      5%
 *   ATS Formatting      10%
 *   Hard Skills         15%
 *   Soft Skills          5%
 *   Critical Reqs        5%
 */

import { openRouterJSON } from "./openRouterService.js";

// ========================================================
// WEIGHTS CONFIGURATION
// ========================================================
const WEIGHTS = {
  keywordMatch: 0.35,
  jobTitle: 0.10,
  experience: 0.15,
  education: 0.05,
  formatting: 0.10,
  hardSkills: 0.15,
  softSkills: 0.05,
  criticalRequirements: 0.05,
};

// ========================================================
// SKILL NORMALIZATION & ALIASES
// ========================================================
const SKILL_ALIASES = {
  js: "javascript",
  ts: "typescript",
  node: "node.js",
  reactjs: "react",
  "react js": "react",
  postgres: "postgresql",
  "postgres sql": "postgresql",
  mysql: "sql",
  mongo: "mongodb",
  aws: "amazon web services",
  gcp: "google cloud platform",
  azure: "microsoft azure",
  ci: "continuous integration",
  cd: "continuous deployment",
  "ci/cd": "continuous integration / continuous deployment",
  seo: "search engine optimization",
  ux: "user experience",
  ui: "user interface",
  ai: "artificial intelligence",
  ml: "machine learning",
  "react native": "react-native",
  express: "express.js",
  next: "next.js",
  nuxt: "nuxt.js",
  jquery: "jquery",
  rdbms: "relational database",
  orm: "object relational mapping",
  api: "application programming interface",
  spa: "single page application",
  ssr: "server side rendering",
  jvm: "java virtual machine",
};

/**
 * Normalize a single skill string.
 */
const normalizeSkill = (skill) => {
  const trimmed = skill.toLowerCase().trim();
  return SKILL_ALIASES[trimmed] || trimmed;
};

/**
 * Normalize an array of skills.
 */
const normalizeSkills = (skills) => {
  return skills.map(normalizeSkill);
};

// ========================================================
// JOB PARSING
// ========================================================

/**
 * Parse a job description text into a structured requirements object.
 * Uses OpenRouter for intelligent extraction, falls back to basic regex.
 */
const parseJobDescription = async (jobDescription) => {
  try {
    const systemPrompt = `You are a job description parser. Extract structured information from the job description below. Return STRICT JSON ONLY (no markdown). Use this exact schema:
{
  "title": "",
  "requiredSkills": [],
  "preferredSkills": [],
  "responsibilities": [],
  "requiredExperienceYears": 0,
  "education": "",
  "certifications": [],
  "keywords": [],
  "softSkills": [],
  "hardRequirements": [],
  "requiresOnSite": false,
  "requiresSecurityClearance": false,
  "requiresVisaSponsorship": false,
  "location": ""
}`;

    const result = await openRouterJSON(systemPrompt, jobDescription, 0.1);
    return {
      title: result.title || "",
      requiredSkills: normalizeSkills(result.requiredSkills || []),
      preferredSkills: normalizeSkills(result.preferredSkills || []),
      responsibilities: result.responsibilities || [],
      requiredExperienceYears: result.requiredExperienceYears || 0,
      education: result.education || "",
      certifications: result.certifications || [],
      keywords: normalizeSkills(result.keywords || []),
      softSkills: result.softSkills || [],
      hardRequirements: result.hardRequirements || [],
      requiresOnSite: result.requiresOnSite || false,
      requiresSecurityClearance: result.requiresSecurityClearance || false,
      requiresVisaSponsorship: result.requiresVisaSponsorship || false,
      location: result.location || "",
    };
  } catch (err) {
    console.warn("⚠️ LLM job parsing failed, using fallback:", err.message);
    return fallbackParseJobDescription(jobDescription);
  }
};

/**
 * Fallback: Basic regex-based job description parsing.
 */
const fallbackParseJobDescription = (text) => {
  const lower = text.toLowerCase();
  return {
    title: extractTitle(text),
    requiredSkills: extractSkills(text),
    preferredSkills: [],
    responsibilities: [],
    requiredExperienceYears: extractExperienceYears(lower),
    education: extractEducation(lower),
    certifications: extractCertifications(lower),
    keywords: extractKeywords(text),
    softSkills: extractSoftSkills(lower),
    hardRequirements: [],
    requiresOnSite: lower.includes("on-site") || lower.includes("onsite") || lower.includes("in office"),
    requiresSecurityClearance: lower.includes("security clearance") || lower.includes("clearance required"),
    requiresVisaSponsorship: false,
    location: "",
  };
};

const extractTitle = (text) => {
  const lines = text.split("\n").filter((l) => l.trim());
  return lines[0]?.trim() || "";
};

const extractSkills = (text) => {
  const techKeywords = [
    "javascript", "typescript", "python", "java", "c#", "c++", "ruby", "go", "rust",
    "react", "angular", "vue", "node.js", "express", "django", "flask", "spring",
    "docker", "kubernetes", "aws", "azure", "gcp", "terraform", "jenkins",
    "sql", "postgresql", "mongodb", "redis", "elasticsearch",
    "git", "github", "gitlab", "ci/cd", "rest", "graphql",
    "html", "css", "sass", "tailwind", "bootstrap",
    "redux", "webpack", "babel", "jest", "mocha", "cypress",
  ];
  const lower = text.toLowerCase();
  return techKeywords.filter((skill) => lower.includes(skill));
};

const extractExperienceYears = (text) => {
  const match = text.match(/(\d+)\+?\s*(?:years?\s*(?:of\s+)?(?:experience|exp))/i);
  return match ? parseInt(match[1]) : 0;
};

const extractEducation = (text) => {
  if (text.includes("bachelor")) return "Bachelor's Degree";
  if (text.includes("master")) return "Master's Degree";
  if (text.includes("phd") || text.includes("doctorate")) return "PhD";
  if (text.includes("associate")) return "Associate Degree";
  return "";
};

const extractCertifications = (text) => {
  const certs = [
    "aws certified", "aws certification", "azure certification",
    "pmp", "prince2", "scrum master", "cissp", "ceh",
    "comptia", "ccna", "ccnp", "cfe", "cfa",
  ];
  const lower = text.toLowerCase();
  return certs.filter((c) => lower.includes(c));
};

const extractKeywords = (text) => {
  const words = text.split(/[\s,;.()]+/);
  return [...new Set(words.filter((w) => w.length > 2).map((w) => w.toLowerCase()))];
};

const extractSoftSkills = (text) => {
  const softSkills = [
    "communication", "leadership", "teamwork", "collaboration", "problem solving",
    "analytical", "critical thinking", "time management", "adaptability",
    "agile", "scrum", "kanban", "mentoring", "presentation",
  ];
  const lower = text.toLowerCase();
  return softSkills.filter((s) => lower.includes(s));
};

// ========================================================
// RESUME PARSING
// ========================================================

/**
 * Parse a resume text into a structured profile.
 * Uses OpenRouter for intelligent parsing, falls back to basic extraction.
 */
const parseResume = async (resumeText) => {
  try {
    const systemPrompt = `You are a resume parser. Extract structured information from the resume below. Return STRICT JSON ONLY (no markdown). Use this exact schema:
{
  "name": "",
  "summary": "",
  "skills": [],
  "certifications": [],
  "education": [],
  "jobTitles": [],
  "totalExperienceYears": 0,
  "hasBackendSkills": false,
  "hasFrontendSkills": false,
  "hasDevOpsSkills": false
}`;

    const result = await openRouterJSON(systemPrompt, resumeText, 0.1);
    return {
      name: result.name || "",
      summary: result.summary || "",
      skills: normalizeSkills(result.skills || []),
      certifications: result.certifications || [],
      education: result.education || [],
      jobTitles: result.jobTitles || [],
      totalExperienceYears: result.totalExperienceYears || 0,
      hasBackendSkills: result.hasBackendSkills || false,
      hasFrontendSkills: result.hasFrontendSkills || false,
      hasDevOpsSkills: result.hasDevOpsSkills || false,
    };
  } catch (err) {
    console.warn("⚠️ LLM resume parsing failed, using fallback:", err.message);
    return fallbackParseResume(resumeText);
  }
};

const fallbackParseResume = (text) => {
  const lower = text.toLowerCase();
  const lines = text.split("\n");
  return {
    name: lines[0]?.trim() || "",
    summary: "",
    skills: extractSkills(text),
    certifications: extractCertifications(text),
    education: [],
    jobTitles: [],
    totalExperienceYears: extractExperienceYears(lower),
    hasBackendSkills: /node|express|django|flask|api|backend|sql/.test(lower),
    hasFrontendSkills: /react|angular|vue|html|css|frontend/.test(lower),
    hasDevOpsSkills: /docker|kubernetes|aws|ci|jenkins|devops/.test(lower),
  };
};

// ========================================================
// SCORING FUNCTIONS
// ========================================================

/**
 * Calculate keyword match score.
 */
const calculateKeywordScore = (resumeSkills, jobRequiredSkills, jobPreferredSkills, jobKeywords) => {
  if (jobRequiredSkills.length === 0 && jobPreferredSkills.length === 0) {
    return { score: 50, matched: [], missing: [] };
  }

  const resumeSkillSet = new Set(resumeSkills.map((s) => s.toLowerCase()));
  const allJobSkills = [
    ...new Set([
      ...jobRequiredSkills.map((s) => s.toLowerCase()),
      ...jobPreferredSkills.map((s) => s.toLowerCase()),
      ...jobKeywords.map((s) => s.toLowerCase()),
    ]),
  ];

  const matched = allJobSkills.filter((s) => resumeSkillSet.has(s));
  const missing = allJobSkills.filter((s) => !resumeSkillSet.has(s));
  const score = allJobSkills.length > 0
    ? Math.round((matched.length / allJobSkills.length) * 100)
    : 50;

  return { score, matched, missing };
};

/**
 * Calculate job title similarity score.
 */
const calculateTitleScore = (resumeTitles, jobTitle) => {
  if (!jobTitle || resumeTitles.length === 0) {
    return 50;
  }

  const lowerJobTitle = jobTitle.toLowerCase();
  const lowerResumeTitles = resumeTitles.map((t) => t.toLowerCase());

  // Check direct match
  if (lowerResumeTitles.some((t) => t === lowerJobTitle)) {
    return 100;
  }

  // Check partial word overlap
  const jobWords = new Set(lowerJobTitle.split(/[\s-/]+/));
  const maxOverlap = Math.max(
    ...lowerResumeTitles.map((rt) => {
      const resumeWords = new Set(rt.split(/[\s-/]+/));
      const intersection = [...jobWords].filter((w) => resumeWords.has(w));
      return intersection.length / Math.max(jobWords.size, 1);
    })
  );

  return Math.round(Math.min(maxOverlap * 100, 95));
};

/**
 * Calculate experience match score.
 */
const calculateExperienceScore = (resumeYears, requiredYears) => {
  if (requiredYears === 0) return 100;
  if (resumeYears >= requiredYears) return 100;
  if (resumeYears === 0) return 0;
  const ratio = resumeYears / requiredYears;
  if (ratio >= 0.75) return 80;
  if (ratio >= 0.5) return 60;
  if (ratio >= 0.25) return 30;
  return 10;
};

/**
 * Calculate education match score.
 */
const calculateEducationScore = (resumeEducation, jobEducation) => {
  if (!jobEducation) return 100;
  const levels = {
    "phd": 5,
    "doctorate": 5,
    "master": 4,
    "bachelor": 3,
    "associate": 2,
    "high school": 1,
  };

  const jobLevel = Object.entries(levels).find(([key]) =>
    jobEducation.toLowerCase().includes(key)
  )?.[1] || 0;

  if (jobLevel === 0) return 100;

  // Check if resume mentions any education at or above the required level
  const eduText = Array.isArray(resumeEducation)
    ? resumeEducation.join(" ").toLowerCase()
    : "";

  const resumeLevel = Object.entries(levels).find(([key]) =>
    eduText.includes(key)
  )?.[1] || 0;

  if (resumeLevel >= jobLevel) return 100;
  if (resumeLevel === jobLevel - 1) return 50;
  return 0;
};

/**
 * Calculate ATS formatting score.
 */
const calculateFormattingScore = (resumeText) => {
  const lower = resumeText.toLowerCase();
  const issues = [];

  // Check for tables (pipe characters or tab-separated content)
  if (resumeText.includes("|") && resumeText.split("\n").filter((l) => l.includes("|")).length > 2) {
    issues.push("Contains tables or pipe-separated content");
  }

  // Check for multiple columns (lots of tab characters)
  const tabCount = (resumeText.match(/\t/g) || []).length;
  if (tabCount > 10) {
    issues.push("Two-column layout detected (multiple tabs)");
  }

  // Check for images or icons (Unicode symbols)
  const iconCount = (resumeText.match(/[☐☑☒★☆✦✧✅❌⚠️▶🔹🔸⬤●○◆◇►]/g) || []).length;
  if (iconCount > 5) {
    issues.push("Contains icons or symbols that may confuse ATS parsers");
  }

  // Check for missing standard sections
  if (!lower.includes("experience") && !lower.includes("work history")) {
    issues.push("Missing Experience/Work History section");
  }
  if (!lower.includes("education")) {
    issues.push("Missing Education section");
  }
  if (!lower.includes("skill")) {
    issues.push("Missing Skills section");
  }

  // Score calculation: start at 100, deduct for each issue
  const deduction = issues.length * 10;
  const score = Math.max(0, 100 - deduction);

  return { score, issues };
};

/**
 * Calculate hard skills score.
 */
const calculateHardSkillsScore = (resumeSkills, jobRequiredSkills) => {
  if (jobRequiredSkills.length === 0) return 100;

  const normalizedResume = new Set(resumeSkills.map((s) => s.toLowerCase()));
  const required = [...new Set(jobRequiredSkills.map((s) => s.toLowerCase()))];

  const matched = required.filter((s) => normalizedResume.has(s));
  const missing = required.filter((s) => !normalizedResume.has(s));
  const score = Math.round((matched.length / required.length) * 100);

  return { score, matched, missing };
};

/**
 * Calculate soft skills score.
 */
const calculateSoftSkillsScore = (resumeText, jobSoftSkills) => {
  if (jobSoftSkills.length === 0) {
    return { score: 100, matched: [], missing: [] };
  }

  const lowerResume = resumeText.toLowerCase();
  const matched = jobSoftSkills.filter((s) => lowerResume.includes(s.toLowerCase()));
  const score = Math.round((matched.length / jobSoftSkills.length) * 100);

  return { score, matched, missing: jobSoftSkills.filter((s) => !matched.includes(s)) };
};

/**
 * Check critical requirements.
 */
const checkCriticalRequirements = (resumeText, userProfile, jobRequirements) => {
  const mismatches = [];
  const lower = resumeText.toLowerCase();

  if (jobRequirements.requiresOnSite && userProfile) {
    const userLocation = userProfile.location?.toLowerCase() || "";
    const jobLocation = jobRequirements.location?.toLowerCase() || "";
    if (userLocation && jobLocation && !userLocation.includes(jobLocation)) {
      mismatches.push(`On-site required at ${jobRequirements.location} but user is in ${userProfile.location}`);
    }
  }

  if (jobRequirements.requiresSecurityClearance) {
    if (!lower.includes("security clearance")) {
      mismatches.push("Job requires security clearance");
    }
  }

  if (jobRequirements.requiresVisaSponsorship && userProfile?.isAuthorizedToWorkInUS) {
    mismatches.push("Job may require visa sponsorship");
  }

  const score = mismatches.length === 0 ? 100 : 0;
  return { score, mismatches };
};

// ========================================================
// LLM ENHANCED SCORING
// ========================================================

/**
 * Use OpenRouter to enhance the scoring with semantic understanding.
 */
const getEnhancedScore = async (resumeText, jobDescription) => {
  try {
    const systemPrompt = `You are an ATS matching engine. Analyze the resume against the job description and return a structured JSON score. Be strict and accurate.

Return STRICT JSON ONLY (no markdown) with this exact schema:
{
  "overallScore": 0-100,
  "mismatchedHardRequirements": false,
  "mismatchedReason": "",
  "matchedSkills": [],
  "missingSkills": [],
  "titleSimilarity": 0-100,
  "experienceMatch": true,
  "atsIssues": [],
  "recommendations": []
}`;

    const prompt = `RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription}`;
    const result = await openRouterJSON(systemPrompt, prompt, 0.1);

    return {
      overallScore: result.overallScore || 0,
      mismatchedHardRequirements: result.mismatchedHardRequirements || false,
      mismatchedReason: result.mismatchedReason || "",
      matchedSkills: result.matchedSkills || [],
      missingSkills: result.missingSkills || [],
      titleSimilarity: result.titleSimilarity || 0,
      experienceMatch: result.experienceMatch || false,
      atsIssues: result.atsIssues || [],
      recommendations: result.recommendations || [],
    };
  } catch (err) {
    console.warn("⚠️ LLM enhanced scoring failed:", err.message);
    return null;
  }
};

// ========================================================
// MAIN EXPORTED FUNCTION
// ========================================================

/**
 * Scan a job description against a user's resume and profile.
 * Returns a detailed match analysis.
 *
 * @param {object} userProfile - User document with onboardingDetails and baseResumeText
 * @param {string} jobDescription - Raw job description text
 * @returns {Promise<object>} Match analysis result
 */
export const scanJobDescription = async (userProfile, jobDescription) => {
  try {
    const resumeText = userProfile.baseResumeText || "";
    const skills = userProfile.onboardingDetails?.skillsList || [];

    // Parse both inputs
    const [parsedResume, parsedJob] = await Promise.all([
      parseResume(resumeText),
      parseJobDescription(jobDescription),
    ]);

    // Add user's listed skills to parsed resume skills
    const allResumeSkills = [
      ...new Set([
        ...parsedResume.skills,
        ...normalizeSkills(skills),
      ]),
    ];

    // Calculate individual scores
    const keywordResult = calculateKeywordScore(
      allResumeSkills,
      parsedJob.requiredSkills,
      parsedJob.preferredSkills,
      parsedJob.keywords
    );

    const titleScore = calculateTitleScore(parsedResume.jobTitles, parsedJob.title);
    const experienceScore = calculateExperienceScore(
      parsedResume.totalExperienceYears,
      parsedJob.requiredExperienceYears
    );
    const educationScore = calculateEducationScore(parsedResume.education, parsedJob.education);
    const formattingResult = calculateFormattingScore(resumeText);
    const hardSkillsResult = calculateHardSkillsScore(allResumeSkills, parsedJob.requiredSkills);
    const softSkillsResult = calculateSoftSkillsScore(resumeText, parsedJob.softSkills);
    const criticalResult = checkCriticalRequirements(resumeText, userProfile.onboardingDetails, parsedJob);

    // Check hard requirement mismatches
    let mismatchedHardRequirements = false;
    let mismatchedReason = "";

    if (parsedJob.requiresOnSite && userProfile.onboardingDetails?.location) {
      const userLoc = (userProfile.onboardingDetails.location || "").toLowerCase();
      const jobLoc = (parsedJob.location || "").toLowerCase();
      if (jobLoc && !userLoc.includes(jobLoc.split(",")[0])) {
        mismatchedHardRequirements = true;
        mismatchedReason = `This job requires on-site presence in ${parsedJob.location}`;
      }
    }

    if (parsedJob.requiresSecurityClearance) {
      mismatchedHardRequirements = true;
      mismatchedReason = mismatchedReason
        ? `${mismatchedReason}. Also requires security clearance.`
        : "This job requires security clearance";
    }

    // Calculate weighted final score
    const keywordWeighted = keywordResult.score * WEIGHTS.keywordMatch;
    const titleWeighted = titleScore * WEIGHTS.jobTitle;
    const experienceWeighted = experienceScore * WEIGHTS.experience;
    const educationWeighted = educationScore * WEIGHTS.education;
    const formattingWeighted = formattingResult.score * WEIGHTS.formatting;
    const hardSkillsWeighted = hardSkillsResult.score * WEIGHTS.hardSkills;
    const softSkillsWeighted = softSkillsResult.score * WEIGHTS.softSkills;
    const criticalWeighted = criticalResult.score * WEIGHTS.criticalRequirements;

    const overallScore = Math.round(
      keywordWeighted +
        titleWeighted +
        experienceWeighted +
        educationWeighted +
        formattingWeighted +
        hardSkillsWeighted +
        softSkillsWeighted +
        criticalWeighted
    );

    // If hard requirements mismatched, override score to 0
    const finalScore = mismatchedHardRequirements ? 0 : overallScore;

    // Try to get LLM-enhanced scoring for better recommendations
    const enhanced = await getEnhancedScore(resumeText, jobDescription).catch(() => null);

    // Build category scores
    const categoryScores = {
      keywordMatch: keywordResult.score,
      jobTitle: titleScore,
      experience: experienceScore,
      education: educationScore,
      formatting: formattingResult.score,
      hardSkills: hardSkillsResult.score,
      softSkills: softSkillsResult.score,
      criticalRequirements: criticalResult.score,
    };

    // Build recommendations
    const recommendations = [
      ...(enhanced?.recommendations || []),
      ...(hardSkillsResult.missing.length > 0
        ? [`Add ${hardSkillsResult.missing.slice(0, 3).join(", ")} to your skills`]
        : []),
      ...(formattingResult.issues.length > 0
        ? ["Use a single-column ATS-friendly layout"]
        : []),
      ...(keywordResult.missing.length > 5
        ? ["Consider adding more industry keywords to your resume"]
        : []),
    ];

    const result = {
      overallScore: finalScore,
      categoryScores,
      matchedSkills: [...new Set([...keywordResult.matched, ...hardSkillsResult.matched])],
      missingSkills: [...new Set([...keywordResult.missing, ...hardSkillsResult.missing])],
      matchedKeywords: keywordResult.matched,
      missingKeywords: keywordResult.missing,
      matchedResponsibilities: [],
      missingResponsibilities: [],
      atsIssues: [...new Set([...formattingResult.issues, ...(enhanced?.atsIssues || [])])],
      mismatchedHardRequirements,
      mismatchedReason,
      recommendations: [...new Set(recommendations)],
    };

    return result;
  } catch (err) {
    console.error("❌ jobscanService.scanJobDescription error:", err.message);
    throw new Error(`Job scan failed: ${err.message}`);
  }
};

export default {
  scanJobDescription,
};