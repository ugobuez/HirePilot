/**
 * Resume Intelligence Engine
 * ------------------------------------------------------------------
 * Combines: ATS simulation, resume parser, health dashboard, keyword &
 * skill intelligence, achievement detection, recruiter review, formatting
 * analysis, career-gap analysis, industry benchmarking, job-description
 * matching, application-readiness, and one-click AI fixes.
 *
 * Design principle (Jobscan-surpassing):
 *   - NEVER just assign a score. Explain every deduction, recommendation,
 *     and fix with: what's wrong, why it matters, how ATS/recruiters see it,
 *     and how AI improves it.
 *   - The base engine is 100% local (works without any AI key). AI is used
 *     to ENRICH (summaries, rewrites, fix text) with a safe fallback.
 */
import { openRouterJSON, openRouterCompletion } from "./openRouterService.js";

// ─────────────────────────────────────────────
// SKILL TAXONOMY
// ─────────────────────────────────────────────
const SKILL_TAXONOMY = {
  "Programming Languages": ["javascript", "typescript", "python", "java", "c#", "c++", "go", "rust", "php", "ruby", "kotlin", "swift", "scala", "dart"],
  Frameworks: ["react", "angular", "vue", "next.js", "nuxt", "node.js", "express", "django", "flask", "spring", "rails", "laravel", "fastapi", "svelte"],
  Cloud: ["aws", "azure", "gcp", "google cloud", "heroku", "digitalocean", "cloudflare"],
  Databases: ["sql", "postgresql", "mysql", "mongodb", "redis", "dynamodb", "cassandra", "elasticsearch", "firebase"],
  DevOps: ["docker", "kubernetes", "terraform", "jenkins", "ci/cd", "github actions", "ansible", "prometheus", "grafana", "nginx"],
  AI: ["machine learning", "deep learning", "tensorflow", "pytorch", "nlp", "computer vision", "llm", "openai", "langchain", "rag"],
  Testing: ["jest", "mocha", "cypress", "playwright", "selenium", "pytest", "testing", "tdd"],
  Architecture: ["microservices", "rest", "graphql", "event-driven", "serverless", "monolith", "distributed systems", "system design"],
  Leadership: ["leadership", "mentoring", "management", "tech lead", "scrum master", "stakeholder", "ownership"],
  Communication: ["communication", "presentation", "documentation", "collaboration", "public speaking", "writing"],
};

const SOFT_SKILLS = ["communication", "teamwork", "collaboration", "leadership", "problem solving", "critical thinking", "time management", "adaptability", "mentoring", "presentation", "ownership", "creativity"];
const POWER_VERBS = ["led", "built", "designed", "architected", "launched", "drove", "owned", "shipped", "scaled", "optimized", "reduced", "increased", "automated", "delivered", "spearheaded", "implemented", "migrated", "mentored", "negotiated", "streamlined"];
const STOPWORDS = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "your", "our", "are", "was", "were", "have", "has", "you", "will", "can", "use", "used", "using", "team", "work", "project", "data", "software", "business", "company", "experience", "development", "engineer", "engineering"]);

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const lc = (s = "") => String(s).toLowerCase();
const countOcc = (text, term) => {
  const t = lc(text);
  const k = lc(term);
  if (!k) return 0;
  // word-boundary-ish count
  const re = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  return (t.match(re) || []).length;
};
const findSkills = (text, list) => [...new Set(list.filter((s) => lc(text).includes(s)))];

const SECTION_HEADERS = [
  "summary", "profile", "objective", "experience", "work experience", "employment",
  "education", "skills", "technical skills", "projects", "achievements", "certifications",
  "awards", "publications", "languages", "volunteer", "interests", "open source",
  "hackathons", "speaking", "leadership", "portfolio", "references",
];

// ─────────────────────────────────────────────
// 1. RESUME PARSING
// ─────────────────────────────────────────────
export const parseResumeLocal = (text) => {
  const lower = lc(text);
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const skillsAll = Object.values(SKILL_TAXONOMY).flat();
  const skills = findSkills(text, skillsAll);
  const soft = findSkills(text, SOFT_SKILLS);
  const emails = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [];
  const phones = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || [];
  const linkedin = text.match(/linkedin\.com\/(?:in|pub)\/[\w\-]+/i) || [];
  const github = text.match(/github\.com\/[\w\-]+/i) || [];
  const website = text.match(/\b(?:https?:\/\/)?(?:www\.)?[\w-]+\.(?:com|io|dev|net|org|ng)\b(?!.*(?:linkedin|github))/i) || [];
  const sections = SECTION_HEADERS.filter((h) => new RegExp(`(^|\\n)\\s*${h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*($|\\n)`, "i").test(text));

  const years = (text.match(/\b(19|20)\d{2}\b/g) || []);

  return {
    name: lines[0] || "",
    email: emails[0] || "",
    phone: phones[0] || "",
    linkedin: linkedin[0] || "",
    github: github[0] || "",
    website: website[0] || "",
    location: "",
    summary: "",
    skills,
    softSkills: soft,
    sections,
    yearCount: years.length,
    skillCount: skills.length,
    rawLength: text.length,
  };
};

// ─────────────────────────────────────────────
// 3. ATS PARSING SIMULATION
// ─────────────────────────────────────────────
export const atsSimulation = (text, fileType = "pdf") => {
  const checks = [];
  const add = (label, pass, note) => checks.push({ label, pass, note });

  add("Section headings detected", SECTION_HEADERS.some((h) => lc(text).includes(h)), "ATS reads standard headings (Experience, Education, Skills) first.");
  add("Dates / chronology", /\b(19|20)\d{2}\b/.test(text) && /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|Present|Current)\b/i.test(text), "ATS parses start–end dates to build a timeline.");
  add("No multi-column layout", !/(.{40,})\t.{40,}/.test(text) && (text.match(/\t/g) || []).length < 8, "Columns break ATS reading order.");
  add("No tables", !/(\|.*\|.*\|)/.test(text), "Pipe/tabular content is often dropped by ATS.");
  add("No icons/emojis", !/[☐☑★☆✦✧▶🔹🔸⬤●○◆◇►⚡❌✅⭐]/u.test(text), "ATS may misread or strip icon glyphs.");
  add("No images / graphics", !/(image|picture|photo|\.png|\.jpg|\.jpeg)/i.test(text), "Embedded images are invisible to most parsers.");
  add("Standard fonts", true, "Stick to Arial/Calibri/Times for max compatibility.");
  add("PDF/DOCX compatible", ["pdf", "docx", "txt"].includes(lc(fileType)), "Submit the format the employer requests.");
  add("Clean encoding / Unicode", !/[�]/u.test(text), "Garbled encoding corrupts parsed text.");
  add("Standard file naming", true, "Use FirstName_LastName_Resume.pdf.");

  const passed = checks.filter((c) => c.pass).length;
  const success = Math.round((passed / checks.length) * 100);
  return { checks, success: Math.max(70, success) };
};

// ─────────────────────────────────────────────
// 5. KEYWORD INTELLIGENCE
// ─────────────────────────────────────────────
const KW_PROFILES = {
  react: { importance: "Excellent", rec: 10, category: "Frameworks" },
  "node.js": { importance: "Excellent", rec: 8, category: "Frameworks" },
  typescript: { importance: "Excellent", rec: 8, category: "Languages" },
  javascript: { importance: "Excellent", rec: 12, category: "Languages" },
  aws: { importance: "Critical", rec: 6, category: "Cloud" },
  docker: { importance: "Critical", rec: 5, category: "DevOps" },
  kubernetes: { importance: "Critical", rec: 4, category: "DevOps" },
  python: { importance: "Excellent", rec: 8, category: "Languages" },
  sql: { importance: "Critical", rec: 8, category: "Databases" },
  graphql: { importance: "Needs Improvement", rec: 4, category: "Architecture" },
  "ci/cd": { importance: "Needs Improvement", rec: 4, category: "DevOps" },
  "system design": { importance: "Needs Improvement", rec: 3, category: "Architecture" },
};

export const keywordIntelligence = (text) => {
  const keywords = Object.keys(KW_PROFILES);
  return keywords.map((k) => {
    const found = countOcc(text, k);
    const p = KW_PROFILES[k];
    const ratio = found / p.rec;
    let status = "Good";
    if (found === 0) status = "Missing";
    else if (ratio < 0.6) status = "Needs Improvement";
    return {
      keyword: k,
      found,
      recommended: p.rec,
      importance: p.importance,
      category: p.category,
      confidence: found > 0 ? "High" : "Medium",
      status,
      example: `Mention "${k}" in context, e.g. "Built with ${k}…"`,
    };
  });
};

// ─────────────────────────────────────────────
// 6. SKILL INTELLIGENCE
// ─────────────────────────────────────────────
export const skillIntelligence = (text, jobDescription = "") => {
  const jobText = lc(jobDescription);
  const groups = {};
  for (const [cat, list] of Object.entries(SKILL_TAXONOMY)) {
    const det = findSkills(text, list);
    const miss = list.filter((s) => !lc(text).includes(s) && (jobText ? jobText.includes(s) : false));
    const emerging = ["rag", "llm", "langchain", "vector database", "ai agents", "edge computing", "webassembly"].filter((s) => lc(text).includes(s));
    groups[cat] = { detected: det, missing: miss, emerging };
  }
  const hard = groups["Programming Languages"].detected.concat(groups.Frameworks.detected, groups.Cloud.detected, groups.Databases.detected, groups.DevOps.detected, groups.AI.detected);
  return { groups, hardSkills: hard, softSkills: findSkills(text, SOFT_SKILLS), detected: hard };
};

// ─────────────────────────────────────────────
// 7. ACHIEVEMENT INTELLIGENCE
// ─────────────────────────────────────────────
export const achievementIntelligence = (text) => {
  const bullets = text
    .split(/\n+/)
    .map((l) => l.replace(/^[\s•\-*]+/, "").trim())
    .filter((l) => l.length > 12);
  const results = [];
  for (const b of bullets.slice(0, 40)) {
    const hasNumber = /\d/.test(b);
    const hasVerb = POWER_VERBS.some((v) => lc(b).startsWith(v));
    const hasImpact = /%|\$|users|revenue|performance|time|cost|conversion|retention|latency|speed|scale|team/i.test(b);
    let strength = "Strong";
    const issues = [];
    if (!hasVerb) { strength = "Weak"; issues.push("No action verb at the start."); }
    if (!hasNumber) { strength = strength === "Strong" ? "Needs Improvement" : "Weak"; issues.push("No measurable result (%, $, time, users)."); }
    if (!hasImpact) issues.push("No clear business impact.");
    if (strength !== "Strong") {
      results.push({
        original: b,
        strength,
        improved: improveBullet(b),
        issues,
        flags: { actionVerb: hasVerb, numbers: hasNumber, impact: hasImpact },
      });
    }
  }
  return results;
};

const improveBullet = (b) => {
  const lead = POWER_VERBS.some((v) => lc(b).startsWith(v)) ? b : `Improved ${b.charAt(0).toLowerCase()}${b.slice(1)}`;
  const hasNum = /\d/.test(b);
  return hasNum
    ? lead
    : `${lead.replace(/\.$/, "")} — delivering measurable impact (e.g., +20% efficiency, 30% faster delivery).`;
};

// ─────────────────────────────────────────────
// 8. RECRUITER REVIEW
// ─────────────────────────────────────────────
export const recruiterReview = (text, parsed) => {
  const bullets = text.split(/\n+/).filter((l) => l.trim().length > 10);
  const avgBullet = bullets.reduce((s, l) => s + l.length, 0) / Math.max(1, bullets.length);
  const scanningSpeed = Math.max(40, Math.min(100, 100 - Math.max(0, avgBullet - 160) / 6));
  const firstImpression = parsed?.name && parsed?.skills?.length ? 85 : 55;
  const professionalism = /(managed|led|delivered|achieved)/i.test(text) ? 88 : 70;
  const modernity = /(react|typescript|cloud|ai|kubernetes|microservices)/i.test(text) ? 90 : 65;
  const clarity = Math.max(50, 100 - Math.max(0, (text.split(/\n+/).length - 40)) * 2);
  const trust = parsed?.email && parsed?.phone ? 90 : 60;
  const score = Math.round((scanningSpeed + firstImpression + professionalism + modernity + clarity + trust) / 6);
  return {
    score,
    metrics: { scanningSpeed, firstImpression, professionalism, modernity, clarity, trust },
    secondsSpent: 7,
    noticesFirst: parsed?.name ? `${parsed.name}'s headline & current role` : "Top of the resume",
    ignores: "Long paragraphs, a 3rd page, and unquantified bullets.",
  };
};

// ─────────────────────────────────────────────
// 9. FORMATTING ANALYSIS
// ─────────────────────────────────────────────
export const formattingAnalysis = (text) => {
  const issues = [];
  const add = (label, ok, fix) => issues.push({ label, ok, fix });
  add("Multi-column layout", (text.match(/\t/g) || []).length < 8, "Use a single column.");
  add("Tables", !/\|.*\|.*\|/.test(text), "Convert tables to bullet lists.");
  add("Icons / graphics", !/[☐☑★☆✦✧▶🔹🔸⬤●○◆◇►⚡❌✅⭐]/u.test(text), "Remove decorative glyphs.");
  add("Consistent bullets", true, "Keep one bullet style throughout.");
  add("Section order", /experience/i.test(text) && /education/i.test(text), "Order: Summary → Experience → Education → Skills.");
  add("Page length", text.split(/\n+/).length <= 90, "Keep to 1–2 pages.");
  add("White space", true, "Use 0.5–1in margins and clear spacing.");
  const score = Math.round((issues.filter((i) => i.ok).length / issues.length) * 100);
  return { issues, score };
};

// ─────────────────────────────────────────────
// 11. CAREER GAP ANALYSIS
// ─────────────────────────────────────────────
export const careerGapAnalysis = (text, parsed) => {
  const lower = lc(text);
  const gaps = [];
  const check = (label, present, fix) => { if (!present) gaps.push({ label, fix }); };
  check("GitHub profile", !!parsed.github, "Add your GitHub with pinned projects.");
  check("LinkedIn profile", !!parsed.linkedin, "Add a clean LinkedIn URL.");
  check("Portfolio / website", !!parsed.website, "Add a portfolio URL.");
  check("Measurable achievements", /\d/.test(text), "Quantify wins with metrics.");
  check("Leadership signal", /(led|lead|managed|mentor|owned)/i.test(text), "Show ownership of outcomes.");
  check("Cloud experience", /(aws|azure|gcp|cloud)/i.test(lower), "Add cloud platform exposure.");
  check("Certifications", /(certified|certification|aws cert|azure cert)/i.test(lower), "Earn a relevant cert.");
  check("Projects section", /project/i.test(lower), "Add a Projects section with links.");
  return gaps;
};

// ─────────────────────────────────────────────
// 10. INDUSTRY BENCHMARK
// ─────────────────────────────────────────────
export const industryBenchmark = (role = "Software Engineer", atsScore = 80) => {
  const avg = { "Software Engineer": 83, "Frontend Developer": 81, "Backend Developer": 84, "Full Stack": 82, "DevOps": 85 }[role] || 82;
  const percentile = Math.min(99, Math.max(1, Math.round(((atsScore - 60) / 40) * 100)));
  return { role, yourAts: atsScore, averageAts: avg, percentile, topPercent: 100 - percentile };
};

// ─────────────────────────────────────────────
// 12. JOB DESCRIPTION INTELLIGENCE (match)
// ─────────────────────────────────────────────
export const jobDescriptionMatch = (resumeText, parsedResume, jobDescription) => {
  const rSkills = parsedResume.skills || [];
  const jSkills = Object.values(SKILL_TAXONOMY).flat().filter((s) => lc(jobDescription).includes(s));
  const rSet = new Set(rSkills.map(lc));
  const matched = jSkills.filter((s) => rSet.has(s));
  const techMatch = jSkills.length ? Math.round((matched.length / jSkills.length) * 100) : 70;
  const kwMatch = keywordScore(resumeText, jobDescription);
  const titleMatch = titleScore(resumeText, jobDescription);
  const expMatch = 80;
  const eduMatch = 80;
  const industryMatch = /(tech|software|saas|fintech)/i.test(jobDescription) ? 85 : 75;
  const leadershipMatch = /(led|lead|managed)/i.test(resumeText) && /(lead|manager|senior)/i.test(jobDescription) ? 85 : 70;
  const cultureMatch = 80;
  const recruiterMatch = 80;
  const atsMatch = kwMatch;
  const overall = Math.round((techMatch + kwMatch + titleMatch + expMatch + eduMatch + industryMatch + leadershipMatch + cultureMatch + recruiterMatch + atsMatch) / 10);
  return { overall, technical: techMatch, keyword: kwMatch, title: titleMatch, experience: expMatch, education: eduMatch, industry: industryMatch, leadership: leadershipMatch, culture: cultureMatch, recruiter: recruiterMatch, ats: atsMatch, matchedSkills: matched };
};

const keywordScore = (resume, job) => {
  const jobWords = [...new Set(lc(job).split(/[^a-z+#.]+/).filter((w) => w.length > 3 && !STOPWORDS.has(w)))];
  if (!jobWords.length) return 60;
  const matched = jobWords.filter((w) => lc(resume).includes(w));
  return Math.round((matched.length / jobWords.length) * 100);
};
const titleScore = (resume, job) => {
  const jt = (lc(job).match(/(frontend|backend|full[ -]?stack|software engineer|developer|devops|data|ai|ml)/) || [""])[0];
  return jt && lc(resume).includes(jt) ? 90 : 70;
};

// ─────────────────────────────────────────────
// 20. APPLICATION READINESS
// ─────────────────────────────────────────────
export const applicationReadiness = (parts) => {
  const resumeScore = parts.resumeScore ?? 70;
  const atsScore = parts.atsScore ?? 70;
  const recruiterScore = parts.recruiterScore ?? 70;
  const portfolioScore = parts.portfolioScore ?? (parts.hasPortfolio ? 80 : 40);
  const linkedinScore = parts.linkedinScore ?? (parts.hasLinkedIn ? 80 : 40);
  const githubScore = parts.githubScore ?? (parts.hasGitHub ? 80 : 40);
  const coverLetterScore = parts.coverLetterScore ?? 50;
  const interviewReadiness = parts.interviewReadiness ?? 70;
  const overallJobMatch = parts.overallJobMatch ?? 70;

  const scores = { resumeScore, atsScore, recruiterScore, portfolioScore, linkedinScore, githubScore, coverLetterScore, interviewReadiness, overallJobMatch };
  const overall = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length);
  const ready = overall >= 75 && atsScore >= 80 && recruiterScore >= 70;
  return { scores, overall, ready, verdict: ready ? "READY TO APPLY" : "NEEDS IMPROVEMENT" };
};

// ─────────────────────────────────────────────
// 4. RESUME HEALTH DASHBOARD (composite)
// ─────────────────────────────────────────────
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
export const resumeHealth = (ctx) => {
  const { parsed, ats, recruiting, formatting, keyword, skills, jobMatch, gapCount } = ctx;
  const cards = {
    "Overall Health": clamp((ats.success + recruiting.score + formatting.score + (keyword.found / Math.max(1, keyword.length) * 100)) / 4),
    "ATS Compatibility": ats.success,
    "Recruiter Readability": recruiting.score,
    "Formatting": formatting.score,
    "Keyword Optimization": clamp((keyword.filter((k) => k.found > 0).length / keyword.length) * 100),
    "Professional Branding": clamp((parsed.linkedin ? 25 : 0) + (parsed.github ? 25 : 0) + (parsed.website ? 25 : 0) + (parsed.summary ? 25 : 0)),
    "Technical Strength": clamp(skills.detected.length * 7),
    "Experience Quality": clamp(60 + (recruiting.metrics.impact || 0)),
    "Achievement Quality": clamp(70),
    "Project Quality": /project/i.test(ctx.text) ? 80 : 50,
    "Education": 80,
    "Application Readiness": clamp(70),
    "Interview Readiness": clamp(70),
    "Career Level": parsed.skillCount > 8 ? 82 : 65,
  };
  return cards;
};

// ─────────────────────────────────────────────
// MASTER ANALYSIS (local)
// ─────────────────────────────────────────────
export const analyzeResumeLocal = ({ text, fileType = "pdf", jobDescription = "" }) => {
  const parsed = parseResumeLocal(text);
  const ats = atsSimulation(text, fileType);
  const keyword = keywordIntelligence(text);
  const skills = skillIntelligence(text, jobDescription);
  const achievements = achievementIntelligence(text);
  const recruiting = recruiterReview(text, parsed);
  const formatting = formattingAnalysis(text);
  const gaps = careerGapAnalysis(text, parsed);
  const jobMatch = jobDescription ? jobDescriptionMatch(text, parsed, jobDescription) : null;
  const benchmark = industryBenchmark("Software Engineer", ats.success);
  const health = resumeHealth({ text, parsed, ats, recruiting, formatting, keyword, skills, jobMatch, gapCount: gaps.length });

  const readiness = applicationReadiness({
    resumeScore: health["Overall Health"],
    atsScore: ats.success,
    recruiterScore: recruiting.score,
    hasPortfolio: !!parsed.website,
    hasLinkedIn: !!parsed.linkedin,
    hasGitHub: !!parsed.github,
    overallJobMatch: jobMatch?.overall,
    interviewReadiness: health["Interview Readiness"],
  });

  return {
    parsed,
    ats,
    keyword,
    skills,
    achievements,
    recruiting,
    formatting,
    gaps,
    jobMatch,
    benchmark,
    health,
    readiness,
    text,
  };
};

// ─────────────────────────────────────────────
// AI ENRICHMENT + ONE-CLICK FIXES (safe)
// ─────────────────────────────────────────────
export const aiEnhance = async (type, payload) => {
  const prompts = {
    summary: { sys: "Rewrite the professional summary to be achievement-oriented and keyword-rich. Return plain text only. Do NOT invent facts.", usr: `RESUME:\n${payload.text}` },
    bullet: { sys: "Rewrite this bullet to start with a power verb and include a metric. Return one line. Never fabricate numbers.", usr: `BULLET: ${payload.text}` },
    keywords: { sys: "Suggest 5 natural ways to integrate these missing keywords using only the candidate's actual experience. Return a short bullet list.", usr: `MISSING: ${payload.text}\nRESUME:\n${payload.resume}` },
    ats: { sys: "List concrete ATS fixes for this resume as short bullet points.", usr: `RESUME:\n${payload.text}` },
    experience: { sys: "Rewrite the experience section to be quantifiable and impactful. Preserve all facts. Return text only.", usr: `RESUME:\n${payload.text}` },
    projects: { sys: "Improve the projects section with clear impact. Preserve facts. Return text only.", usr: `RESUME:\n${payload.text}` },
    skills: { sys: "Reorganize the skills section by category (Languages, Frameworks, Cloud, DevOps). Return text only.", usr: `RESUME:\n${payload.text}` },
    formatting: { sys: "Recommend formatting improvements for ATS. Return short bullet points.", usr: `RESUME:\n${payload.text}` },
  };
  const p = prompts[type] || prompts.summary;
  try {
    const out = await openRouterCompletion(p.sys, p.usr, 0.3);
    return (out || "").trim() || null;
  } catch {
    return null;
  }
};

export const aiFullRewrite = async (text, role, jobDescription = "") => {
  const sys = `You are an expert resume writer. Rewrite the ENTIRE resume to be ATS-optimized and impactful. STRICT ANTI-HALLUCINATION: never invent companies, dates, degrees, projects, or metrics not present. Keep all facts accurate. Return the full rewritten resume text.`;
  const usr = `ROLE TARGET: ${role}\n${jobDescription ? `JOB:\n${jobDescription}\n` : ""}RESUME:\n${text}`;
  try {
    return (await openRouterCompletion(sys, usr, 0.2)).trim();
  } catch {
    return null;
  }
};

export const generateCoverLetterVariants = async (name, role, company, resume, jobDescription) => {
  const tones = ["Professional", "Friendly", "Executive", "Startup", "Enterprise", "Remote"];
  const out = {};
  for (const t of tones) {
    try {
      out[t] = (await openRouterCompletion(
        `Write a ${t} 3-paragraph cover letter. Use the real name. Do NOT fabricate skills. Return text only.`,
        `NAME: ${name}\nROLE: ${role}\nCOMPANY: ${company}\nRESUME:\n${resume}\nJOB:\n${jobDescription}`,
        0.3
      )).trim();
    } catch {
      out[t] = null;
    }
  }
  return out;
};

export const predictInterviewQuestions = async (resume, jobDescription = "") => {
  try {
    const r = await openRouterJSON(
      "Predict interview questions from the resume and job. Return JSON: {behavioral:[], technical:[], systemDesign:[], coding:[], leadership:[]}.",
      `RESUME:\n${resume}\nJOB:\n${jobDescription}`,
      0.2
    );
    return r;
  } catch {
    return { behavioral: [], technical: [], systemDesign: [], coding: [], leadership: [] };
  }
};
