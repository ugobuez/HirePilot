/**
 * Functional smoke test — no network, no database.
 *
 * Exercises the Addendum H modules end to end:
 *   resume text -> local parse -> keyword extraction -> ATS score ->
 *   tailored PDF/DOCX -> round-trip verification -> rescScan target
 *
 * Run: node scripts/smoke.js
 */
import fs from "node:fs";
import path from "node:path";
import { parseResumeLocal } from "../services/resumeParser.js";
import { scoreJob, rescScanTarget, parseJob } from "../services/atsScoring.js";
import { extractKeywords } from "../services/keywords.js";
import { renderResumePdf, renderResumeDocx, buildFilename, pageBudget } from "../services/atsPdf.js";
import { verifyPdf, renderVerifiedResume } from "../services/roundTrip.js";
import { health } from "../services/llmRouter.js";

const RESUME_TEXT = `Jane Doe
jane.doe@example.com | (415) 555-0134 | San Francisco, CA
https://github.com/janedoe

SUMMARY
Senior backend engineer with 9 years building distributed systems in Node.js and Go.

EXPERIENCE
Senior Software Engineer, Acme Corp, San Francisco, CA
Jan 2021 - Present
Built event-driven services handling 40k requests per second in Node.js and TypeScript.
Reduced p99 latency 45% by adding Redis caching and Postgres query tuning.
Led migration of 30 services to Kubernetes with Docker and Terraform.

Software Engineer, Globex, Austin, TX
Jun 2017 - Dec 2020
Developed REST APIs in Python and Django serving 2M monthly users.
Implemented CI/CD with Jenkins and AWS Lambda.

EDUCATION
BSc in Computer Science, University of Texas, Aug 2013 - May 2017

SKILLS
Node.js, TypeScript, JavaScript, Python, Go, PostgreSQL, Redis, Docker, Kubernetes, AWS, Terraform, REST APIs, GraphQL, CI/CD, Microservices
`;

const JOB_GOOD = {
  title: "Senior Backend Engineer",
  company: "TechCo",
  location: "Remote (US)",
  description: `We are hiring a Senior Backend Engineer (remote, US).
Requirements:
- 5+ years of experience with Node.js and TypeScript
- Strong knowledge of PostgreSQL and Redis
- Experience with Docker and Kubernetes
- Familiarity with AWS
Nice to have:
- Experience with GraphQL
- Terraform experience
We are unable to sponsor visas.`,
};

const JOB_POOR = {
  title: "Registered Nurse",
  company: "HealthCo",
  location: "London, UK",
  description: `We need a Registered Nurse.
Requirements:
- Must have 3+ years of clinical nursing experience
- Knowledge of patient triage and phlebotomy
- Must be authorized to work in the UK
No visa sponsorship.`,
};

const checks = [];
const check = (name, pass, detail = "") => {
  checks.push({ name, pass: Boolean(pass), detail });
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
};

console.log("\n=== HirePilot smoke test ===\n");

// --- 1. Local parse -------------------------------------------------------
console.log("1. Local resume parse");
const parsed = parseResumeLocal(RESUME_TEXT);
check("name parsed", parsed.name === "Jane Doe", parsed.name);
check("email parsed", parsed.email === "jane.doe@example.com", parsed.email);
check("phone parsed", parsed.phone.replace(/\D/g, "").includes("4155550134"), parsed.phone);
check("experience entries", parsed.experience.length === 2, `${parsed.experience.length}`);
check("skills parsed", parsed.skills.length >= 10, `${parsed.skills.length} skills`);
check("summary parsed", parsed.summary.length > 20, `${parsed.summary.length} chars`);
check("parse is fast", parsed.parseMs < 2000, `${parsed.parseMs}ms`);
check("education parsed", parsed.education.length >= 1, parsed.education[0]?.degree || "");

// --- 2. Keyword extraction -----------------------------------------------
console.log("\n2. Keyword extraction");
const kws = extractKeywords(JOB_GOOD.description, { limit: 20 });
check("keywords extracted", kws.length > 5, `${kws.length} keywords`);
check("keywords are objects/strings", kws.length > 0, JSON.stringify(kws[0]));

// --- 3. Job requirement split --------------------------------------------
console.log("\n3. Must-have vs nice-to-have split");
const parsedJob = parseJob(JOB_GOOD);
check("must-haves found", parsedJob.mustHave.length >= 3, `${parsedJob.mustHave.length}`);
check("nice-to-haves found", parsedJob.niceToHave.length >= 1, `${parsedJob.niceToHave.length}`);
check("years required parsed", parsedJob.yearsRequired === 5, `${parsedJob.yearsRequired}`);
check("visa stance = none", parsedJob.visaStance === "none", `${parsedJob.visaStance}`);
check("remote detected", parsedJob.remote === true, `${parsedJob.remote}`);

// --- 4. Scoring: strong match --------------------------------------------
console.log("\n4. Scoring — strong match");
const profile = {
  resumeText: RESUME_TEXT,
  skillsList: parsed.skills,
  targetTitles: ["Senior Backend Engineer", "Backend Engineer"],
  yearsOfExperience: 9,
  authorizedCountries: ["United States"],
  needsSponsorship: false,
  remotePreference: "remote",
};
const good = scoreJob(JOB_GOOD, profile, { threshold: 70 });
check("score in 0..100", good.score >= 0 && good.score <= 100, `${good.score}`);
check("strong match passes", good.pass === true, `score=${good.score} pass=${good.pass}`);
check("must-have matches found", good.mustHaveMatched.length >= 3, `${good.mustHaveMatched.length}`);
check("reasons populated", good.reasons.length >= 4, `${good.reasons.length} reasons`);
console.log(`      score=${good.score} must=${good.mustHaveMatched.length} missing=${good.missingKeywords.length}`);
console.log(`      reason[0]: ${good.reasons[0]}`);

// --- 5. Scoring: weak match must stay low --------------------------------
console.log("\n5. Scoring — weak match must NOT score high");
const poor = scoreJob(JOB_POOR, profile, { threshold: 70 });
check("weak match scores low", poor.score < 40, `${poor.score}`);
check("weak match does not pass", poor.pass === false, `pass=${poor.pass}`);
check("skip reasons present", poor.skipReasons.length > 0, poor.skipReasons.join("; "));
console.log(`      score=${poor.score}`);

// --- 6. Empty profile must be 0, not a constant --------------------------
console.log("\n6. Empty profile scores low (no constant fallback)");
const empty = scoreJob(JOB_GOOD, {}, { threshold: 70 });
check("empty profile = 0 skill matches", empty.mustHaveMatched.length === 0, `${empty.mustHaveMatched.length}`);
check("empty profile fails", empty.pass === false, `score=${empty.score}`);
check("empty profile score low", empty.score < 30, `${empty.score}`);

// --- 7. rescan target is honest ------------------------------------------
console.log("\n7. re-scan target honesty");
const resc = rescScanTarget(JOB_GOOD, profile, good.score);
check("rescanned equals real score", resc.rescanned === good.score, `${resc.rescanned}`);
check("blocked skills listed", Array.isArray(resc.blockedByMissingSkills), `${resc.blockedByMissingSkills.length}`);
check("has a note", typeof resc.note === "string" && resc.note.length > 0, resc.note.slice(0, 60));

// --- 8. PDF render + round trip ------------------------------------------
console.log("\n8. PDF render + round-trip verification");
const baseResume = {
  name: parsed.name,
  email: parsed.email,
  phone: parsed.phone,
  location: parsed.location,
  urls: parsed.urls,
  summary: parsed.summary,
  experience: parsed.experience,
  education: parsed.education,
  skills: parsed.skills,
  projects: parsed.projects,
  certifications: parsed.certifications,
};
const fname = buildFilename(baseResume, "Senior Backend Engineer");
check("filename rule", fname === "Jane_Doe_Senior_Backend_Engineer", fname);
check("page budget (9y => 2)", pageBudget(baseResume) === 2, `${pageBudget(baseResume)}`);

const pdf = await renderResumePdf(baseResume, { job: JOB_GOOD });
check("pdf produced", pdf.buffer.length > 1000, `${pdf.buffer.length} bytes`);
check("pdf header valid", pdf.buffer.slice(0, 5).toString() === "%PDF-", pdf.buffer.slice(0, 5).toString());
check("pdf within page budget", pdf.pages <= 2, `${pdf.pages} pages`);

const verified = await verifyPdf(pdf.buffer, baseResume);
check("round trip readable", verified.ok === true, JSON.stringify(verified.failures || []).slice(0, 240));
console.log(`      ok=${verified.ok} needsReview=${verified.needsReview} extractors=${JSON.stringify(verified.extractors)}`);

const rendered = await renderVerifiedResume(baseResume, { job: JOB_GOOD });
check("renderVerifiedResume returns buffer", (rendered.buffer?.length || 0) > 1000, `${rendered.buffer?.length} bytes`);
check("renderVerifiedResume passes review", rendered.needsReview === false, JSON.stringify(rendered.attempts || []).slice(0, 240));

// --- 9. DOCX render -------------------------------------------------------
console.log("\n9. DOCX render");
const docx = await renderResumeDocx(baseResume, { job: JOB_GOOD });
check("docx produced", docx.buffer.length > 1000, `${docx.buffer.length} bytes`);
check("docx is a zip", docx.buffer.slice(0, 2).toString() === "PK", docx.buffer.slice(0, 2).toString());
check("docx filename", String(docx.filename).endsWith(".docx"), docx.filename);

// --- 10. LLM router health (offline, no calls) ---------------------------
console.log("\n10. LLM router health (offline-safe)");
const h = health();
check("health reports providers", typeof h.configured === "object", JSON.stringify(h.configured));
check("local fallback always available", h.configured.localFallback === true, "");

// --- 11. Artifacts written to a gitignored dir ---------------------------
console.log("\n11. Artifact output");
const outDir = path.resolve(process.cwd(), "artifacts", "smoke");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, pdf.filename), pdf.buffer);
fs.writeFileSync(path.join(outDir, docx.filename), docx.buffer);
const written = fs.readdirSync(outDir);
check("artifacts written", written.length >= 2, written.join(", "));
check(
  "artifacts dir is gitignored",
  fs.readFileSync(path.resolve(process.cwd(), "..", ".gitignore"), "utf8").includes("artifacts"),
  ""
);

// --- Summary --------------------------------------------------------------
const failed = checks.filter((c) => !c.pass);
console.log(`\n=== ${checks.length - failed.length}/${checks.length} checks passed ===`);
if (failed.length) {
  console.log("\nFAILURES:");
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  process.exitCode = 1;
} else {
  console.log("Artifacts written to server/artifacts/smoke/ — open the PDF to eyeball it.");
}
