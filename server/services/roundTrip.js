import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseResumeLocal } from "./resumeParser.js";
import { canonical, normalizeText } from "./keywords.js";
import { renderResumePdf, buildFilename, pageBudget, ALLOWED_SECTIONS } from "./atsPdf.js";
import logger from "../utils/logger.js";

const execFileAsync = promisify(execFile);

// Reading-order agreement required between two independent extractors.
const ORDER_AGREEMENT_MIN = 0.95;

/**
 * Tidy extracted text while KEEPING the line structure: the round-trip check
 * re-parses this text, and sections/entries only survive as separate lines.
 */
const tidyExtracted = (raw) =>
  String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

/**
 * Round-trip parse verification (Addendum H §2).
 *
 * For every generated PDF:
 *  1. extract the text with TWO independent extractors
 *  2. both must agree on the reading order
 *  3. re-parse that text with the app's OWN resume parser
 *  4. every field of the base resume must survive the trip
 *
 * Failure => the pipeline regenerates with a simpler layout, then falls back to
 * "Needs review". We never ship a document we cannot read back.
 */

let pdfParseModule;
const loadPdfParse = async () => {
  if (pdfParseModule !== undefined) return pdfParseModule;
  try {
    const mod = await import("pdf-parse");
    pdfParseModule = mod.default || mod;
  } catch {
    pdfParseModule = null;
  }
  return pdfParseModule;
};

/** Extractor #1: pdf-parse (pdfjs-based). Uses a temp file: pdfjs mis-reads
 * some Buffers ("bad XRef entry") although the same bytes parse from disk. */
const extractWithPdfParse = async (buffer) => {
  const mod = await loadPdfParse();
  if (!mod) return { available: false, text: "", error: "pdf-parse_not_installed" };
  const os = await import("node:os");
  const fs = await import("node:fs");
  const tmp = `${os.tmpdir()}/hirepilot-parse-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
  try {
    await fs.promises.writeFile(tmp, buffer);
    const out = await mod(tmp);
    return { available: true, text: tidyExtracted(out?.text) };
  } catch (err) {
    return { available: false, text: "", error: err.message };
  } finally {
    fs.promises.unlink(tmp).catch(() => {});
  }
};

/** Extractor #2: pdftotext (poppler) when it is on PATH. */
const extractWithPdftotext = async (buffer) => {
  try {
    // write to a temp file because pdftotext is a CLI
    const os = await import("node:os");
    const tmp = `${os.tmpdir()}/hirepilot-${Date.now()}.pdf`;
    const fs = await import("node:fs");
    await fs.promises.writeFile(tmp, buffer);
    const { stdout } = await execFileAsync("pdftotext", ["-layout", tmp, "-"], { timeout: 15000 });
    await fs.promises.unlink(tmp).catch(() => {});
    return { available: true, text: tidyExtracted(stdout) };
  } catch (err) {
    // Not installed: allowed, but the single-extractor path is then flagged.
    return { available: false, text: "", error: err.code === "ENOENT" ? "pdftotext_not_installed" : err.message };
  }
};

/** Unescape a PDF literal string (handles \, \n, and octal escapes). */
const decodePdfString = (s) =>
  String(s)
    .replace(/\\([nrtbf()\\])/g, (_, c) => ({ n: "\n", r: "\n", t: " ", b: "", f: "" }[c] ?? c))
    .replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));

/** Pull reading-ordered lines out of one decompressed content stream. */
const extractTextFromContent = (content) => {
  const lines = [];
  let line = "";
  // PDFKit emits text as hex strings in TJ arrays: [<4a616e65> 0] TJ
  const re = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>|T\*|Td|TD|ET|TJ|Tj/g;
  let m;
  while ((m = re.exec(content))) {
    const tok = m[0];
    if (tok.startsWith("(")) {
      line += decodePdfString(tok.slice(1, -1));
    } else if (tok.startsWith("<")) {
      const hex = tok.slice(1, -1).replace(/\s+/g, "");
      line += Buffer.from(hex.length % 2 ? `${hex}0` : hex, "hex").toString("latin1");
    } else if (tok === "T*" || tok === "Td" || tok === "TD" || tok === "ET") {
      if (line.trim()) lines.push(line.trim());
      line = "";
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines
    .join("\n")
    // WinAnsi bullets/dashes and stray control bytes carry no reading order.
    .replace(/[\u0080-\u009F\u2013\u2014\u2022\u25CF]/g, " ")
    .replace(/[^\x20-\x7E\n]/g, " ");
};

/**
 * Extractor #2: dependency-free. Inflates every stream with zlib and reads the
 * PDF text operators directly (no pdfjs, no poppler). Independent of extractor #1
 * by construction, so the two can genuinely disagree.
 */
export const extractWithZlib = async (buffer) => {
  try {
    const zlib = await import("node:zlib");
    const raw = buffer.toString("latin1");
    const chunks = [];
    const streamRe = /stream\r?\n([\s\S]*?)endstream/g;
    let m;
    while ((m = streamRe.exec(raw))) {
      const body = Buffer.from(m[1], "latin1");
      let content = null;
      try {
        content = zlib.inflateSync(body).toString("latin1");
      } catch {
        content = /BT|Tj|TJ/.test(m[1]) ? m[1] : null; // uncompressed stream
      }
      if (!content) continue;
      const text = extractTextFromContent(content);
      if (text) chunks.push(text);
    }
    return { available: true, text: chunks.join("\n").replace(/[ \t]+/g, " ").trim() };
  } catch (err) {
    return { available: false, text: "", error: err.message };
  }
};

/** Compare reading order as an ordered list of content tokens. */
export const readingOrder = (text) =>
  normalizeText(text)
    .split(" ")
    .filter(Boolean)
    .filter((t) => !["•", "-", "–", "|", ","].includes(t));

/**
 * Order-sensitive, symmetric agreement between two reading orders.
 * Longest-common-subsequence ratio: reordered or dropped words both lower it.
 */
const orderAgreement = (a, b) => {
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  const m = b.length;
  let prev = new Array(m + 1).fill(0);
  let cur = new Array(m + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= m; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    const swap = prev;
    prev = cur;
    cur = swap;
    cur.fill(0);
  }
  return (2 * prev[m]) / (a.length + m);
};

/** Fields that MUST round-trip. */
export const criticalFields = (resume) => {
  const fields = [
    { path: "name", value: resume.name },
    { path: "email", value: resume.email },
    { path: "phone", value: resume.phone },
  ];
  for (const [i, e] of (resume.experience || []).entries()) {
    fields.push({ path: `experience[${i}].title`, value: e.title });
    fields.push({ path: `experience[${i}].employer`, value: e.employer });
    fields.push({ path: `experience[${i}].dates`, value: e.dateDisplay || `${e.start} – ${e.end}` });
  }
  for (const [i, ed] of (resume.education || []).entries()) {
    fields.push({ path: `education[${i}].degree`, value: [ed.degree, ed.field].filter(Boolean).join(" in ") });
  }
  for (const s of resume.skills || []) fields.push({ path: `skill:${canonical(s)}`, value: s });
  return fields.filter((f) => f.value && String(f.value).trim());
};

/**
 * Verify a rendered resume PDF against its base data.
 * @returns {Promise<{ok, failures, extractors, agreements, parsed, sectionOrder}>}
 */
/** Does the extracted text still contain this value (tolerant of dash/space noise)? */
const survives = (text, value) => {
  const hay = normalizeText(text);
  const needle = normalizeText(value);
  if (!needle) return true;
  if (hay.includes(needle)) return true;
  // dates: "Jan 2022 - Mar 2024" vs en dash; both normalize to the same tokens
  const parts = needle.split(" ").filter(Boolean);
  if (parts.length > 1 && parts.every((p) => hay.includes(p))) return true;
  // phone / email digit-level check
  const digits = needle.replace(/\D/g, "");
  if (digits.length >= 7 && hay.replace(/\D/g, "").includes(digits)) return true;
  return false;
};

export const verifyPdf = async (buffer, baseResume) => {
  const [a, b, c] = await Promise.all([
    extractWithPdfParse(buffer),
    extractWithZlib(buffer),
    extractWithPdftotext(buffer),
  ]);
  const failures = [];

  if (!a.available || a.text.length < 40) {
    failures.push({
      type: "extraction",
      detail: `Primary extractor (pdfjs) could not read the PDF${a.error ? `: ${a.error}` : "."}`,
    });
  }
  if (!b.available) {
    failures.push({
      type: "extraction",
      detail: `Secondary extractor (zlib) could not read the PDF${b.error ? `: ${b.error}` : "."}`,
    });
  }

  // Every pair of usable extractors must agree on the reading order.
  const usable = [
    { name: "pdfjs", ...a },
    { name: "zlib", ...b },
    ...(c.available ? [{ name: "pdftotext", ...c }] : []),
  ].filter((x) => x.available && x.text.length >= 40);

  const agreements = {};
  if (usable.length >= 2) {
    for (let i = 0; i < usable.length; i++) {
      for (let j = i + 1; j < usable.length; j++) {
        const key = `${usable[i].name}Vs${usable[j].name}`;
        const agree = orderAgreement(readingOrder(usable[i].text), readingOrder(usable[j].text));
        agreements[key] = agree;
        if (agree < ORDER_AGREEMENT_MIN) {
          failures.push({
            type: "reading-order",
            detail: `${usable[i].name} and ${usable[j].name} disagree on reading order (${(agree * 100).toFixed(1)}%, need ${(ORDER_AGREEMENT_MIN * 100).toFixed(0)}%).`,
          });
        }
      }
    }
  } else {
    // One opinion is not a check. We ship "Needs review" rather than guess.
    failures.push({
      type: "single-extractor",
      detail: "Only one extractor could read this PDF; a second independent opinion is required before sending.",
    });
  }

  // Image-only PDFs: text extraction yields nothing usable.
  const textForParse = [a.text, b.text, c.text].sort((x, y) => y.length - x.length)[0] || "";
  if (textForParse.length < 40) {
    failures.push({ type: "image-only", detail: "No text layer found — this looks like a scanned or image-based PDF." });
  }

  let parsed = null;
  if (textForParse.length >= 40) {
    parsed = parseResumeLocal(textForParse);
    for (const field of criticalFields(baseResume)) {
      if (!survives(textForParse, field.value)) {
        failures.push({ type: "field-lost", path: field.path, detail: `Missing after round-trip: ${field.value}` });
      }
    }
    // Section headings must appear in the standard order.
    const order = [];
    let cursor = -1;
    for (const name of ALLOWED_SECTIONS) {
      const idx = textForParse.indexOf(name);
      if (idx >= 0) {
        if (idx < cursor) failures.push({ type: "section-order", detail: `Section "${name}" appears out of reading order.` });
        cursor = idx;
        order.push(name);
      }
    }
    var sectionOrder = order;
  } else {
    var sectionOrder = [];
  }

  return {
    ok: failures.length === 0,
    failures,
    agreements,
    extractors: {
      pdfjs: a.available,
      zlib: b.available,
      pdftotext: c.available,
      pdftotextError: c.error || null,
      usable: usable.map((x) => x.name),
    },
    parsed,
    sectionOrder,
  };
};

/**
 * Full pipeline guard used by the apply batch: render, verify, and on failure
 * retry with a simpler layout before handing the job to "Needs review".
 *
 * @param {object} baseResume parsed resume data (source of truth)
 * @param {object} opts { job, maxAttempts }
 */
export const renderVerifiedResume = async (baseResume, { job, maxAttempts = 2 } = {}) => {
  const attempts = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const pdf = await renderResumePdf(baseResume, {
      job,
      // Attempt 2 drops to a compact font/margin set: fewer words per line break
      // is not the fix, but a bigger text block and tighter leading reduces
      // line-wrapping ambiguity for naive extractors.
      maxPages: pageBudget(baseResume),
      simple: attempt > 1,
    });
    const check = await verifyPdf(pdf.buffer, baseResume);
    attempts.push({ attempt, ok: check.ok, failures: check.failures, filename: pdf.filename });
    logger.info("round-trip check", { attempt, ok: check.ok, failures: check.failures.length, job: job?.title });
    if (check.ok) {
      return { ...pdf, check, attempts, needsReview: false };
    }
  }
  return {
    buffer: null,
    filename: attempts[attempts.length - 1]?.filename || buildFilename(baseResume, job?.title),
    check: null,
    attempts,
    needsReview: true,
  };
};

/**
 * Golden fixture runner (addendum §2): 5 resumes x 5 jobs with expected outcomes.
 * @param {Array<{name, resume, job, expect}>} fixtures
 */
export const runGoldenFixtures = async (fixtures) => {
  const results = [];
  for (const f of fixtures) {
    const rendered = await renderVerifiedResume(f.resume, { job: f.job, maxAttempts: 1 });
    const actual = rendered.needsReview ? "needs-review" : "pass";
    results.push({
      name: f.name,
      expected: f.expect,
      actual,
      ok: actual === f.expect,
      failures: rendered.attempts?.[0]?.failures || [],
    });
  }
  return { total: results.length, passed: results.filter((r) => r.ok).length, results };
};

export default { verifyPdf, renderVerifiedResume, runGoldenFixtures, criticalFields, readingOrder, extractWithPdfParse, extractWithZlib, extractWithPdftotext };
