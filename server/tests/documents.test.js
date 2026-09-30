import { renderResumePdf, renderResumeDocx, buildFilename, pageBudget, tailorOrdering, buildSections } from "../services/atsPdf.js";
import { verifyPdf, renderVerifiedResume, extractWithZlib, criticalFields } from "../services/roundTrip.js";
import { parseResumeLocal } from "../services/resumeParser.js";

const RESUME_TEXT = `Jane Doe
jane.doe@example.com | (415) 555-0134 | San Francisco, CA

SUMMARY
Senior backend engineer with 9 years building distributed systems.

EXPERIENCE
Senior Software Engineer, Acme Corp, San Francisco, CA
Jan 2021 - Present
Built event-driven services handling 40k requests per second in Node.js.
Reduced p99 latency 45% by adding Redis caching and Postgres query tuning.

Software Engineer, Globex, Austin, TX
Jun 2017 - Dec 2020
Developed REST APIs in Python and Django serving 2M monthly users.

EDUCATION
BSc in Computer Science, University of Texas, Aug 2013 - May 2017

SKILLS
Node.js, TypeScript, PostgreSQL, Redis, Docker, Kubernetes, AWS, Terraform
`;

const JOB = {
  title: "Senior Backend Engineer",
  description: "Requirements:\n- Node.js and TypeScript\n- PostgreSQL and Redis\n- Docker and Kubernetes",
};

const base = () => {
  const p = parseResumeLocal(RESUME_TEXT);
  return {
    name: p.name,
    email: p.email,
    phone: p.phone,
    location: p.location,
    urls: p.urls,
    summary: p.summary,
    experience: p.experience,
    education: p.education,
    skills: p.skills,
    projects: p.projects,
    certifications: p.certifications,
  };
};

describe("file naming and page budget", () => {
  it("names the file FirstName_LastName_Role", () => {
    expect(buildFilename({ name: "Jane Doe" }, "Senior Backend Engineer")).toBe(
      "Jane_Doe_Senior_Backend_Engineer"
    );
  });

  it("spells out the role instead of echoing the raw title chars", () => {
    expect(buildFilename({ name: "Jane Doe" }, "Backend Engineer (Remote)")) .toBe(
      "Jane_Doe_Backend_Engineer_Remote"
    );
  });

  it("falls back safely when there is no name", () => {
    expect(buildFilename({}, "Engineer")).toBe("Candidate_Engineer");
  });

  it("allows two pages from 8 years of experience, one below", () => {
    expect(pageBudget(base())).toBe(2);
    const junior = { ...base(), experience: [{ start: "Jan 2024", end: "Present" }] };
    expect(pageBudget(junior)).toBe(1);
  });
});

describe("tailoring never invents content", () => {
  it("reorders skills by job relevance but keeps the same set", () => {
    const resume = base();
    const ordered = tailorOrdering(resume, JOB);
    expect(new Set(ordered.skills)).toEqual(new Set(resume.skills));
    expect(ordered.skills[0]).toMatch(/node|typescript|postgres|redis|docker|kubernetes/i);
  });

  it("keeps experience entries intact", () => {
    const resume = base();
    const ordered = tailorOrdering(resume, JOB);
    expect(ordered.experience).toHaveLength(resume.experience.length);
  });

  it("only uses the standard section headings", () => {
    const sections = buildSections(base(), JOB);
    const names = sections.filter((s) => s.kind !== "header").map((s) => s.name);
    for (const n of names) {
      expect(["Summary", "Experience", "Education", "Skills", "Projects", "Certifications"]).toContain(n);
    }
  });
});

describe("PDF rendering", () => {
  it("produces a real PDF within the page budget", async () => {
    const pdf = await renderResumePdf(base(), { job: JOB });
    expect(pdf.buffer.slice(0, 5).toString()).toBe("%PDF-");
    expect(pdf.pages).toBeLessThanOrEqual(2);
    expect(pdf.filename.endsWith(".pdf")).toBe(true);
  });

  it("contains a readable text layer (no images, no outlines)", async () => {
    const pdf = await renderResumePdf(base(), { job: JOB });
    const extracted = await extractWithZlib(pdf.buffer);
    expect(extracted.available).toBe(true);
    expect(extracted.text).toContain("Jane Doe");
    expect(extracted.text).toContain("Experience");
    expect(extracted.text).toContain("Kubernetes");
  });
});

describe("round-trip verification", () => {
  it("passes with two independent extractors agreeing", async () => {
    const pdf = await renderResumePdf(base(), { job: JOB });
    const check = await verifyPdf(pdf.buffer, base());
    expect(check.ok).toBe(true);
    expect(check.failures).toEqual([]);
    expect(check.extractors.usable.length).toBeGreaterThanOrEqual(2);
    for (const value of Object.values(check.agreements)) expect(value).toBeGreaterThanOrEqual(0.95);
  });

  it("keeps every critical field after the trip", async () => {
    const resume = base();
    const pdf = await renderResumePdf(resume, { job: JOB });
    const check = await verifyPdf(pdf.buffer, resume);
    expect(check.parsed.email).toBe(resume.email);
    expect(check.parsed.experience).toHaveLength(2);
    expect(check.parsed.skills.length).toBeGreaterThanOrEqual(5);
    expect(criticalFields(resume).length).toBeGreaterThan(8);
  });

  it("renders a verified resume without needing review", async () => {
    const out = await renderVerifiedResume(base(), { job: JOB });
    expect(out.needsReview).toBe(false);
    expect(out.buffer.length).toBeGreaterThan(1000);
    expect(out.check.ok).toBe(true);
  });

  it("refuses to certify an unreadable (image-only) PDF", async () => {
    const junk = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n");
    const check = await verifyPdf(junk, base());
    expect(check.ok).toBe(false);
    expect(check.failures.map((f) => f.type)).toContain("extraction");
  });
});

describe("DOCX rendering", () => {
  it("produces a valid docx zip with the same filename stem", async () => {
    const docx = await renderResumeDocx(base(), { job: JOB });
    expect(docx.buffer.slice(0, 2).toString()).toBe("PK");
    expect(docx.filename.endsWith(".docx")).toBe(true);
    expect(docx.filename.replace(/\.docx$/, "")).toBe(
      buildFilename(base(), "Senior Backend Engineer")
    );
  });
});
