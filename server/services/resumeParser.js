import { z } from "zod";
import { completeJson } from "./llmRouter.js";
import { canonical } from "./keywords.js";
import config from "../config/index.js";

/**
 * Resume parser with the fastParse toggle (Phase 4).
 *
 *  - fastParse ON (default): deterministic local parsing only, no LLM, ~<2s.
 *  - fastParse OFF: local parse first, then LLM enrichment through the router.
 *
 * The SAME local parser is reused by the Addendum H round-trip verification, so
 * a generated PDF is checked against the exact code path that parsed the input.
 */

const SECTION_ALIASES = {
  summary: ["summary", "professional summary", "profile", "objective", "about", "career summary", "personal statement"],
  experience: ["experience", "work experience", "professional experience", "employment", "employment history", "work history", "career history", "relevant experience"],
  education: ["education", "academic background", "qualifications", "academic qualifications", "education & training"],
  skills: ["skills", "technical skills", "core skills", "competencies", "key skills", "technologies", "tech stack", "toolkit"],
  projects: ["projects", "personal projects", "selected projects", "portfolio"],
  certifications: ["certifications", "certificates", "licenses & certifications", "licenses", "courses", "training"],
};

const SECTION_NAMES = Object.keys(SECTION_ALIASES);

const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Canonical display format: "Jan 2022 – Mar 2024" (en dash, same everywhere). */
export const formatMonthYear = (value) => {
  if (!value) return "";
  const v = String(value).trim();
  const iso = v.match(/^(\d{4})-(\d{1,2})/);
  if (iso) return `${MONTH_NAMES[Number(iso[2]) - 1]} ${iso[1]}`;
  const dmy = v.match(/^(\w{3,9})\.?\s+(\d{4})$/i);
  if (dmy) {
    const idx = MONTHS[dmy[1].toLowerCase().slice(0, 3)];
    if (idx !== undefined) return `${MONTH_NAMES[idx]} ${dmy[2]}`;
  }
  return v;
};

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const URL_RE = /(https?:\/\/[^\s,;)]+|www\.[^\s,;)]+|(?:linkedin\.com|github\.com)\/[^\s,;)]+)/gi;
const DATE_RANGE_RE =
  /((?:[A-Z][a-z]{2,8}\.?\s+)?(?:19|20)\d{2})\s*(?:-|–|—|to|until)\s*((?:[A-Z][a-z]{2,8}\.?\s+)?(?:19|20)\d{2}|present|current|now|ongoing)/i;

/** Parse a date range into display + ISO-ish parts. */
export const parseDateRange = (line) => {
  const m = String(line).match(DATE_RANGE_RE);
  if (!m) return null;
  const start = m[1].trim();
  const endRaw = m[2].trim();
  const present = /present|current|now|ongoing/i.test(endRaw);
  const end = present ? "Present" : endRaw.trim();
  return {
    start,
    end,
    present,
    display: `${formatMonthYear(start)} – ${present ? "Present" : formatMonthYear(end)}`,
  };
};

const SECTION_RE = new RegExp(
  `^\\s*(${SECTION_NAMES.flatMap((s) => SECTION_ALIASES[s]).join("|")})\\s*:?\\s*$`,
  "i"
);

/** Detect the section a line belongs to; returns null for body lines. */
export const matchSection = (line) => {
  const m = String(line).match(SECTION_RE);
  if (!m) return null;
  const hit = m[1].toLowerCase();
  for (const [name, aliases] of Object.entries(SECTION_ALIASES)) {
    if (aliases.some((a) => a === hit)) return name;
  }
  return null;
};

/** Split raw text into {name, lines} sections, tolerating unusual headings. */
export const splitSections = (text) => {
  const sections = {};
  let current = "header";
  sections[current] = [];
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    const name = matchSection(line);
    if (name) {
      current = name;
      sections[current] = sections[current] || [];
      continue;
    }
    sections[current].push(line);
  }
  return sections;
};

const clean = (s) => String(s || "").replace(/[•●▪‣◦⁃*]\s*/g, "").replace(/\s+/g, " ").trim();

/** A line that is essentially only a date range ("Jan 2021 - Present"). */
const isDateOnlyLine = (t) =>
  DATE_RANGE_RE.test(t) && t.replace(DATE_RANGE_RE, "").replace(/[\s,|–—()/-]/g, "").length < 2;

/**
 * Heading detection for experience/education blocks.
 *  - "Senior Engineer, Acme Corp" / "Senior Engineer | Acme" / "Senior Engineer at Acme"
 *  - strictly Title-Case short lines ("Senior Software Engineer")
 * Bullets are sentences: they end with punctuation and are not Title Case, so they
 * never open a new entry.
 */
const looksLikeHeading = (t) => {
  if (!t || t.length > 90) return false;
  if (/[.!?;]$/.test(t)) return false;
  if (/[,|]/.test(t) || /\bat\b/.test(t)) return /^[A-Z]/.test(t);
  const words = t.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 6) return false;
  return words.every((w) => /^[A-Z0-9(]/.test(w));
};

/** Split a block into entries that each start with a title-ish line. */
const splitEntries = (lines) => {
  const entries = [];
  let current = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const alreadyHasDate = current.some((l) => DATE_RANGE_RE.test(l));
    // A date line follows its title, so it only opens an entry when the current
    // one already carries a date (i.e. we are past its header).
    const startsEntry = isDateOnlyLine(t) ? alreadyHasDate : looksLikeHeading(t);
    if (startsEntry && current.length) {
      entries.push(current);
      current = [t];
    } else {
      current.push(t);
    }
  }
  if (current.length) entries.push(current);
  return entries;
};

const parseExperience = (lines) => {
  const out = [];
  for (const entry of splitEntries(lines)) {
    const header = entry[0];
    const range = parseDateRange(header) || (entry[1] ? parseDateRange(entry[1]) : null);
    const dateLine = entry.find((l) => DATE_RANGE_RE.test(l)) || "";
    // Title and employer: split on comma / pipe / at / dash, ignore the date part.
    const cleanedHeader = clean(header.replace(DATE_RANGE_RE, "").replace(/[,|–—-]\s*$/, ""));
    const parts = cleanedHeader
      .split(/\s*(?:,|\||\bat\b|–|—|-)\s*/i)
      .map(clean)
      .filter(Boolean);
    const title = parts[0] || "";
    const employer = parts[1] || "";
    const location = parts[2] || "";
    const bullets = entry
      .filter((l) => l !== header && l !== dateLine)
      .map(clean)
      .filter(Boolean);
    out.push({
      title,
      employer,
      location,
      start: range?.start || "",
      end: range?.present ? "Present" : range?.end || "",
      dateDisplay: range?.display || "",
      present: Boolean(range?.present),
      bullets,
    });
  }
  return out.filter((e) => e.title || e.employer);
};

const DEGREE_RE =
  /\b(B\.?Sc\.?|B\.?A\.?|B\.?Tech\.?|B\.?Eng\.?|B\.?E\.?|M\.?Sc\.?|M\.?A\.?|M\.?Tech\.?|M\.?Eng\.?|MBA|Ph\.?D\.?|Doctorate|Master(?:'s)?|Bachelor(?:'s)?|Associate(?:'s)?|Diploma|HNC|HND|Foundation)\b/i;

const parseEducation = (lines) => {
  const out = [];
  for (const entry of splitEntries(lines)) {
    const text = clean(entry.join(" "));
    const range = parseDateRange(text);
    // Drop the dates first so they cannot be mistaken for the degree or school.
    const withoutDates = clean(text.replace(DATE_RANGE_RE, "").replace(/[,|]\s*$/, ""));
    const parts = withoutDates.split(/\s*[,|]\s*/).map(clean).filter(Boolean);
    const degreeMatch = withoutDates.match(DEGREE_RE);
    const degree = degreeMatch ? clean(degreeMatch[1]) : "";
    // "BSc in Computer Science" -> field "Computer Science"
    const fieldMatch = withoutDates.match(/\b(?:in|of)\s+([A-Za-z&' .]{3,40}?)(?=\s*(?:,|$))/i);
    const field = fieldMatch ? clean(fieldMatch[1]) : "";
    // The institution is the first part that is neither the degree nor the field.
    const institution =
      parts
        .slice(degree ? 1 : 0)
        .find(
          (p) =>
            !DEGREE_RE.test(p) &&
            !(field && p.toLowerCase().includes(field.toLowerCase())) &&
            !/^(?:in|of)\b/i.test(p)
        ) || "";
    out.push({
      degree,
      field,
      institution,
      start: range?.start || "",
      end: range?.present ? "Present" : range?.end || "",
      display: range?.display || "",
      dateDisplay: range?.display || "",
    });
  }
  return out.filter((e) => e.degree || e.field || e.institution);
};

const parseHeader = (lines) => {
  const text = lines.join("\n");
  const email = text.match(EMAIL_RE)?.[0] || "";
  const phone = text.match(PHONE_RE)?.[0]?.replace(/\s+/g, " ").trim() || "";
  const urls = [...new Set((text.match(URL_RE) || []).map((u) => u.trim()))];
  // Name: first non-empty line that is not contact details and looks like a name.
  const candidate = lines
    .map(clean)
    .find((l) => l && l.length <= 60 && !EMAIL_RE.test(l) && !PHONE_RE.test(l) && !/https?:/i.test(l) && !matchSection(l));
  const nameParts = (candidate || "").split(/\s+/).filter(Boolean);
  const looksLikeName =
    nameParts.length >= 2 &&
    nameParts.length <= 4 &&
    nameParts.every((p) => /^[A-Z][A-Za-z'.-]*$/.test(p));
  return {
    name: looksLikeName ? candidate : nameParts.slice(0, 3).join(" "),
    email,
    phone,
    urls,
    location: clean((text.match(/([A-Z][a-zA-Z .'-]+,\s*[A-Z][a-zA-Z .'-]+)/) || [])[1] || ""),
  };
};

/**
 * Deterministic local parse — no LLM. Always runs first.
 * @param {string} text extracted resume text
 */
export const parseResumeLocal = (text) => {
  const started = Date.now();
  const sections = splitSections(text);
  const header = parseHeader(sections.header || []);
  const summaryLines = (sections.summary || []).map(clean).filter(Boolean);
  const result = {
    name: header.name,
    email: header.email,
    phone: header.phone,
    urls: header.urls,
    location: header.location,
    summary: summaryLines.join(" "),
    experience: parseExperience(sections.experience || []),
    education: parseEducation(sections.education || []),
    skills: parseSkills(sections.skills || []),
    projects: (sections.projects || []).map(clean).filter(Boolean),
    certifications: (sections.certifications || []).map(clean).filter(Boolean),
    parser: "local",
    parseMs: 0,
  };
  result.parseMs = Date.now() - started;
  return result;
};

const enrichedSchema = z.object({
  summary: z.string().optional(),
  skills: z.array(z.string()).optional(),
});

/**
 * Parse with the fastParse toggle.
 *  - fastParse true  -> local only (fast, deterministic, free)
 *  - fastParse false -> local first, then LLM enrichment (still falls back to local)
 */
export const parseResume = async (text, { fastParse = true, useLLM } = {}) => {
  const local = parseResumeLocal(text);
  const wantLLM = useLLM ?? (fastParse ? !config.flags.llmEnrichment : config.flags.llmEnrichment);
  if (fastParse || !wantLLM) {
    return { ...local, mode: fastParse ? "fast" : "local-only", llm: null };
  }

  const res = await completeJson(
    "You normalise resume text. You may ONLY reformat and split what is already present. Never add employers, titles, dates, degrees, skills or numbers that are absent from the input. Return JSON only.",
    `NORMALISE THIS RESUME TEXT:\n${String(text).slice(0, 6000)}\n\nReturn JSON: {"summary": string, "skills": string[]}`,
    enrichedSchema,
    () => ({ summary: local.summary, skills: local.skills }),
    // maxCalls: 1 — enrichment is exactly one provider call, never two.
    { tier: "fast", temperature: 0, userId: undefined, maxCalls: 1 }
  );

  const data = res.data || {};
  // Truthfulness guard: enrichment may only reorder/reformat, never invent.
  const localText = `${local.summary} ${local.skills.join(" ")}`.toLowerCase();
  const safeSkills = (data.skills || []).filter((s) => localText.includes(String(s).toLowerCase().trim()));
  return {
    ...local,
    summary: data.summary || local.summary,
    skills: safeSkills.length ? safeSkills : local.skills,
    // Report what actually happened: a local fallback is not an LLM result.
    mode: res.source === "llm" ? "local+llm" : "local-only",
    llm: { provider: res.provider, model: res.model, source: res.source, cached: res.cached },
    parseMs: local.parseMs,
  };
};

/** Flatten a parsed resume back to plain text (used for round-trip checks). */
export const resumeToText = (resume) => {
  const parts = [];
  parts.push(resume.name || "");
  parts.push([resume.email, resume.phone, ...(resume.urls || [])].filter(Boolean).join(" | "));
  if (resume.summary) parts.push(`Summary\n${resume.summary}`);
  if ((resume.experience || []).length) {
    parts.push("Experience");
    for (const e of resume.experience) {
      parts.push(`${e.title}${e.employer ? `, ${e.employer}` : ""} ${e.dateDisplay || `${e.start} – ${e.end}`}`);
      for (const b of e.bullets || []) parts.push(`• ${b}`);
    }
  }
  if ((resume.education || []).length) {
    parts.push("Education");
    for (const ed of resume.education) {
      parts.push(`${ed.degree}${ed.field ? ` in ${ed.field}` : ""} ${ed.institution || ""} ${ed.dateDisplay || ""}`.trim());
    }
  }
  if ((resume.skills || []).length) parts.push(`Skills\n${resume.skills.join(", ")}`);
  if ((resume.projects || []).length) parts.push(`Projects\n${resume.projects.join("\n")}`);
  if ((resume.certifications || []).length) parts.push(`Certifications\n${resume.certifications.join(", ")}`);
  return parts.filter(Boolean).join("\n");
};

export default { parseResume, parseResumeLocal, splitSections, matchSection, parseDateRange, formatMonthYear, resumeToText, SECTION_ALIASES };

const parseSkills = (lines) => {
  const skills = [];
  for (const line of lines) {
    const t = clean(line);
    if (!t) continue;
    for (const part of t.split(/[,;|•·]/)) {
      const s = clean(part);
      if (s && s.length <= 40 && !/^https?:/i.test(s)) skills.push(s);
    }
  }
  const seen = new Set();
  return skills.filter((s) => {
    const c = canonical(s);
    if (seen.has(c)) return false;
    seen.add(c);
    return true;
  });
};
