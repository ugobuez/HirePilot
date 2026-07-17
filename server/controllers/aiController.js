import { extractResumeText } from "../middleware/upload.js";
import { openRouterCompletion } from "../middleware/services/openRouterService.js";
import { scanJobDescription } from "../middleware/services/jobscanService.js";

const TECH_KEYWORDS = [
  "javascript", "typescript", "python", "java", "c#", "c++", "go", "rust",
  "react", "angular", "vue", "node.js", "express", "django", "flask", "spring",
  "docker", "kubernetes", "aws", "azure", "gcp", "terraform", "jenkins",
  "sql", "postgresql", "mongodb", "redis", "graphql", "rest", "html", "css",
  "tailwind", "redux", "webpack", "git", "ci/cd", "linux", "php", "ruby",
];

const extractSkillsFromText = (text) => {
  const lower = text.toLowerCase();
  return [...new Set(TECH_KEYWORDS.filter((k) => lower.includes(k)))];
};

const fallbackCoverLetter = (resumeText, matched = []) => {
  const skills = matched.length ? matched.join(", ") : "my technical skills";
  return [
    "Dear Hiring Team,",
    "",
    "I am excited to apply for this position. My background aligns closely with your requirements, particularly " +
      skills +
      ". I have included my resume for your review and would welcome the opportunity to discuss how I can contribute to your team.",
    "",
    "Thank you for your time and consideration.",
    "",
    "Sincerely,",
    "[Your Name]",
  ].join("\n");
};

const generateCoverLetter = async (resumeText, jobDesc, matched = []) => {
  try {
    const systemPrompt =
      "You are a professional career coach. Write a concise, ATS-friendly 3-paragraph cover letter tailored to the candidate's resume and the job description. Return plain text only.";
    const userPrompt = `RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDesc}`;
    const out = await openRouterCompletion(systemPrompt, userPrompt, 0.3);
    if (out && out.trim().length > 40) return out.trim();
    throw new Error("Empty cover letter");
  } catch {
    return fallbackCoverLetter(resumeText, matched);
  }
};

export const analyzeJob = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Resume file is required" });
    }

    const { jobDesc } = req.body;
    if (!jobDesc) {
      return res.status(400).json({ error: "Job description is required" });
    }

    const resumeText = await extractResumeText(req.file);
    if (!resumeText || !resumeText.trim()) {
      return res.status(400).json({ error: "Could not extract text from the resume file." });
    }

    // Resilient scoring: scanJobDescription uses OpenRouter with a local
    // keyword/experience fallback, so it never hard-fails on AI errors.
    const skills = extractSkillsFromText(resumeText);
    const pseudoUser = {
      baseResumeText: resumeText,
      onboardingDetails: { skillsList: skills },
    };
    const scan = await scanJobDescription(pseudoUser, jobDesc);

    const coverLetter = await generateCoverLetter(resumeText, jobDesc, scan.matchedSkills);

    res.json({
      resumeText,
      parsedResume: { skills, summary: (resumeText || "").slice(0, 200) },
      coverLetter,
      matchScore: Number(scan.overallScore) || 0,
      missingSkills: Array.isArray(scan.missingSkills) ? scan.missingSkills : [],
    });
  } catch (err) {
    console.error("❌ ANALYZE ERROR:", err.message);
    res.status(500).json({ error: "AI Analysis failed", details: err.message });
  }
};
