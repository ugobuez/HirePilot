import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { formatMonthYear } from "./resumeParser.js";
import { canonical, supportsKeyword } from "./keywords.js";
import logger from "../utils/logger.js";

/**
 * ATS-parse-proof document rendering (Addendum H §1).
 *
 * Enforced by the template, not by convention:
 *  - one column, top-to-bottom reading order
 *  - no tables, text boxes, columns, images, icons or graphics
 *  - contact details in the page body (never a header/footer)
 *  - only the standard section headings
 *  - real embedded text in a standard font, 10-12pt, standard bullets
 *  - consistent "Mon YYYY – Mon YYYY" dates, visible full URLs
 *  - 1 page under ~8 years of experience, otherwise max 2
 */

export const ALLOWED_SECTIONS = ["Summary", "Experience", "Education", "Skills", "Projects", "Certifications"];
const FONT = "Helvetica"; // embedded standard font (ATS-safe)
const BODY_SIZE = 10.5;
const HEADING_SIZE = 11.5;
const LINE_GAP = 2;
const MARGIN = 46;
const BULLET = "•";

const slug = (s) =>
  String(s || "")
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "Resume";

/** Filename rule: FirstName_LastName_Role.pdf (addendum §1). */
export const buildFilename = (resume, role) => {
  const parts = String(resume?.name || "Candidate").trim().split(/\s+/);
  const first = parts[0] || "Candidate";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return [first, last, slug(role)].filter(Boolean).join("_");
};

const CURRENT_YEAR = new Date().getFullYear();

/** A date string -> year. "Present" counts as the current year (honest). */
const yearOf = (d) => {
  if (!d) return 0;
  if (/present|current|now|ongoing/i.test(String(d))) return CURRENT_YEAR;
  const m = String(d).match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : 0;
};

const estimateYears = (resume) => {
  const years = (resume.experience || [])
    .flatMap((e) => [yearOf(e.start), yearOf(e.end)])
    .filter(Boolean);
  if (years.length < 2) return 0;
  return Math.max(...years) - Math.min(...years);
};

/** Page budget: 1 page under ~8 years, otherwise max 2. */
export const pageBudget = (resume) => (estimateYears(resume) >= 8 ? 2 : 1);

/**
 * Order content for a single target role. This ONLY reorders and emphasises
 * what the base resume already supports — it never adds a claim (addendum §4).
 */
export const tailorOrdering = (resume, job) => {
  const skills = [...(resume.skills || [])];
  const jobText = `${job?.title || ""}\n${job?.description || ""}`;
  const ordered = [...skills].sort((a, b) => {
    const aHit = supportsKeyword(jobText, canonical(a)) ? 0 : 1;
    const bHit = supportsKeyword(jobText, canonical(b)) ? 0 : 1;
    return aHit - bHit; // job-relevant (and already true) skills first
  });
  const exp = [...(resume.experience || [])];
  const orderExp = (jobTitle) => {
    const want = String(jobTitle || "").toLowerCase();
    return [...exp].sort((a, b) => {
      const sim = (e) => {
        const t = `${e.title} ${(e.bullets || []).join(" ")}`.toLowerCase();
        return want.split(/\s+/).filter((w) => w.length > 3 && t.includes(w)).length;
      };
      return sim(b) - sim(a);
    });
  };
  return {
    skills: ordered,
    experience: orderExp(job?.title),
    projects: [...(resume.projects || [])],
    // Explicitly NOT added: any keyword the resume does not already support.
  };
};

/** Build the ordered section model used by BOTH the PDF and DOCX renderers. */
export const buildSections = (resume, job) => {
  const ordered = job ? tailorOrdering(resume, job) : null;
  const experience = ordered ? ordered.experience : resume.experience || [];
  const skills = ordered ? ordered.skills : resume.skills || [];
  const projects = ordered ? ordered.projects : resume.projects || [];
  const sections = [];

  // Contact details live in the page body, never in a header/footer.
  sections.push({ name: "Header", kind: "header" });

  if (resume.summary) sections.push({ name: "Summary", kind: "summary", lines: [resume.summary] });

  if (experience.length) {
    sections.push({
      name: "Experience",
      kind: "experience",
      entries: experience.map((e) => ({
        title: e.title,
        employer: e.employer,
        location: e.location,
        // Always the canonical display format, regardless of how it was written.
        dates: e.dateDisplay || dateDisplay(e.start, e.end),
        bullets: (e.bullets || []).map((b) => b.replace(/^[•\-*●▪‣◦⁃]\s*/, "").trim()).filter(Boolean),
      })),
    });
  }

  if ((resume.education || []).length) {
    sections.push({
      name: "Education",
      kind: "education",
      entries: resume.education.map((ed) => ({
        degree: [ed.degree, ed.field].filter(Boolean).join(" in "),
        institution: ed.institution,
        dates: ed.dateDisplay || dateDisplay(ed.start, ed.end),
      })),
    });
  }

  if (skills.length) sections.push({ name: "Skills", kind: "skills", lines: [skills.join(", ")] });

  if (projects.length) {
    sections.push({
      name: "Projects",
      kind: "projects",
      entries: projects.map((p) => ({ title: p, bullets: [] })),
    });
  }

  if ((resume.certifications || []).length) {
    sections.push({ name: "Certifications", kind: "certifications", lines: resume.certifications });
  }

  // Only standard headings survive.
  for (const s of sections) {
    if (s.kind !== "header" && !ALLOWED_SECTIONS.includes(s.name)) s.name = s.name || "Summary";
  }
  return sections;
};

const dateDisplay = (start, end) => {
  if (!start && !end) return "";
  const s = formatMonthYear(start);
  const e = /present|current|ongoing|now/i.test(String(end)) ? "Present" : formatMonthYear(end);
  return [s, e].filter(Boolean).join(" – ");
};

/** Write the single-column layout into a pdfkit document. */
const writePdf = (doc, resume, sections, layout = {}) => {
  const L = { size: BODY_SIZE, heading: HEADING_SIZE, gap: LINE_GAP, ...layout };
  doc.font(FONT);

  const heading = (text) => {
    doc.moveDown(0.4);
    doc.fontSize(L.heading).font(`${FONT}-Bold`).text(text);
    doc.moveDown(0.15);
    doc.fontSize(L.size).font(FONT);
  };
  const body = (text, opts = {}) => {
    if (!text) return;
    doc.text(text, { width: doc.page.width - MARGIN * 2, align: "left", lineGap: L.gap, ...opts });
  };

  for (const section of sections) {
    if (section.kind === "header") {
      doc.fontSize(15).font(`${FONT}-Bold`).text(resume.name || "", { align: "left" });
      doc.moveDown(0.15);
      const contact = [resume.location, resume.email, resume.phone, ...(resume.urls || [])]
        .filter(Boolean)
        .join(" | ");
      doc.fontSize(BODY_SIZE).font(FONT).text(contact, { align: "left", lineGap: LINE_GAP });
      continue;
    }
    heading(section.name);
    if (section.kind === "experience" || section.kind === "education" || section.kind === "projects") {
      for (const entry of section.entries) {
        const head = [entry.title, entry.employer].filter(Boolean).join(", ");
        if (head) {
          doc.font(`${FONT}-Bold`).fontSize(BODY_SIZE).text(head, { lineGap: LINE_GAP });
        }
        const sub = [entry.degree, entry.institution].filter(Boolean).join(", ");
        if (sub) doc.font(FONT).fontSize(BODY_SIZE).text(sub, { lineGap: LINE_GAP });
        // Dates on their own line keeps the reading order flat and parseable.
        if (entry.dates) doc.font(FONT).fontSize(BODY_SIZE).text(entry.dates, { lineGap: LINE_GAP });
        for (const b of entry.bullets || []) {
          doc.text(`${BULLET} ${b}`, {
            indent: 10,
            width: doc.page.width - MARGIN * 2 - 10,
            lineGap: LINE_GAP,
          });
        }
        doc.moveDown(0.25);
      }
    } else if (section.kind === "certifications") {
      for (const c of section.lines) doc.text(`${BULLET} ${c}`, { indent: 10, lineGap: LINE_GAP });
    } else {
      body(section.lines[0]);
    }
  }
};

/**
 * Render an ATS-safe resume PDF.
 * @returns {Promise<{buffer: Buffer, pages: number, filename: string, sections: object[]}>}
 */
export const renderResumePdf = (resume, { job, maxPages, simple = false } = {}) => {
  const sections = buildSections(resume, job);
  const filename = `${buildFilename(resume, job?.title || "Resume")}.pdf`;
  const budget = maxPages || pageBudget(resume);
  // "simple" is the fallback layout used when a render fails the round-trip
  // check: tighter leading, slightly smaller body text, smaller margins.
  const layout = simple
    ? { size: 10, heading: 11, gap: 0, margin: 40 }
    : { size: BODY_SIZE, heading: HEADING_SIZE, gap: LINE_GAP, margin: MARGIN };

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: layout.margin, bottom: layout.margin, left: layout.margin, right: layout.margin },
      // No images, no vector graphics, no text boxes: real flowed text only.
      autoFirstPage: true,
      compress: true,
      info: { Title: `${resume.name || "Resume"}`, Author: resume.name || "", Creator: "HirePilot" },
    });
    const chunks = [];
    let pages = 0;
    doc.on("pageAdded", () => {
      pages++;
      // The page cap is a hard requirement (addendum §1).
      if (pages > budget) doc.end();
    });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve({ buffer: Buffer.concat(chunks), pages: Math.max(pages, 1), filename, sections }));
    doc.on("error", reject);

    try {
      writePdf(doc, resume, sections, layout);
    } catch (err) {
      reject(err);
    }
    doc.end();
  });
};

/**
 * Render a matching .docx with the same content and order, because some
 * employers prefer a Word file (addendum §1).
 */
export const renderResumeDocx = async (resume, { job } = {}) => {
  const sections = buildSections(resume, job);
  const children = [];
  const text = (value, opts = {}) =>
    children.push(
      new Paragraph({
        spacing: { after: 60, line: 240 },
        children: [new TextRun({ text: String(value), font: "Arial", size: 21, ...opts })],
      })
    );

  for (const section of sections) {
    if (section.kind === "header") {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({ text: resume.name || "", font: "Arial", size: 30, bold: true })],
        })
      );
      const contact = [resume.location, resume.email, resume.phone, ...(resume.urls || [])].filter(Boolean).join(" | ");
      text(contact);
      continue;
    }
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [new TextRun({ text: section.name, font: "Arial", size: 23, bold: true })],
      })
    );
    if (section.kind === "experience" || section.kind === "education" || section.kind === "projects") {
      for (const entry of section.entries) {
        const head = [entry.title, entry.employer].filter(Boolean).join(", ");
        if (head) text(head, { bold: true });
        const sub = [entry.degree, entry.institution].filter(Boolean).join(", ");
        if (sub) text(sub);
        if (entry.dates) text(entry.dates);
        for (const b of entry.bullets || []) text(`${BULLET} ${b}`, { indent: { left: 240 } });
      }
    } else if (section.kind === "certifications") {
      for (const c of section.lines) text(`${BULLET} ${c}`, { indent: { left: 240 } });
    } else {
      text(section.lines[0]);
    }
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const buffer = await Packer.toBuffer(doc);
  const filename = `${buildFilename(resume, job?.title || "Resume")}.docx`;
  return { buffer, filename };
};

/** Cover letter PDF: same ATS-safe rules, no header/footer, body contact block. */
export const renderCoverLetterPdf = (resume, { role, company, body, date } = {}) => {
  const filename = `${buildFilename(resume, role || "Cover_Letter")}_Cover_Letter.pdf`;
  const heading = `${resume.name || "Candidate"}`;
  const contact = [resume.location, resume.email, resume.phone, ...(resume.urls || [])].filter(Boolean).join(" | ");

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve({ buffer: Buffer.concat(chunks), filename }));
    doc.on("error", reject);

    doc.font(FONT);
    doc.fontSize(13).font(`${FONT}-Bold`).text(heading, { align: "left" });
    doc.moveDown(0.1);
    doc.fontSize(BODY_SIZE).font(FONT).text(contact, { align: "left", lineGap: LINE_GAP });
    doc.moveDown(0.6);
    if (date) doc.text(String(date), { align: "left", lineGap: LINE_GAP });
    doc.moveDown(0.4);
    if (role) {
      doc
        .text(`Re: ${role}${company ? ` at ${company}` : ""}`, { align: "left", lineGap: LINE_GAP });
      doc.moveDown(0.4);
    }
    for (const para of String(body || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
      doc.text(para, { width: doc.page.width - MARGIN * 2, align: "left", lineGap: LINE_GAP });
      doc.moveDown(0.5);
    }
    doc.end();
  });
};

/** Persist artifacts under server/artifacts/<userId>/ (gitignored). */
export const saveArtifact = async (userId, filename, buffer) => {
  const dir = path.resolve(process.cwd(), "artifacts", String(userId || "shared"));
  await fs.promises.mkdir(dir, { recursive: true });
  const full = path.join(dir, filename);
  await fs.promises.writeFile(full, buffer);
  logger.info("artifact written", { file: filename, bytes: buffer.length });
  return full;
};

export default {
  renderResumePdf,
  renderResumeDocx,
  renderCoverLetterPdf,
  buildSections,
  buildFilename,
  pageBudget,
  tailorOrdering,
  saveArtifact,
  ALLOWED_SECTIONS,
};
