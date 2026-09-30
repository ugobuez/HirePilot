import { parseResumeLocal, splitSections, parseDateRange, formatMonthYear, matchSection } from "../services/resumeParser.js";

const RESUME = `Jane Doe
jane.doe@example.com | (415) 555-0134 | San Francisco, CA
https://github.com/janedoe

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
Node.js, TypeScript, Python, PostgreSQL, Redis, Docker, Kubernetes, AWS

PROJECTS
Open-source rate limiter (npm, 2k weekly downloads)
`;

describe("date helpers", () => {
  it("parses an en-dash, hyphen and 'Present' range the same way", () => {
    const hyphen = parseDateRange("Jan 2021 - Present");
    const enDash = parseDateRange("Jan 2021 – Present");
    expect(hyphen).toEqual(enDash);
    expect(hyphen.start).toBe("Jan 2021");
    expect(hyphen.present).toBe(true);
    expect(hyphen.display).toBe("Jan 2021 – Present");
  });

  it("normalises months to the canonical display form", () => {
    expect(formatMonthYear("2021-01")).toBe("Jan 2021");
    expect(formatMonthYear("January 2021")).toBe("Jan 2021");
    expect(formatMonthYear("Dec 2020")).toBe("Dec 2020");
  });

  it("returns null when there is no range", () => {
    expect(parseDateRange("Senior Engineer")).toBeNull();
  });
});

describe("sections", () => {
  it("recognises standard headings and their aliases", () => {
    expect(matchSection("EXPERIENCE")).toBe("experience");
    expect(matchSection("Work History")).toBe("experience");
    expect(matchSection("Technical Skills")).toBe("skills");
    expect(matchSection("Random sentence that is not a heading")).toBeNull();
  });

  it("splits body lines into the right sections", () => {
    const sections = splitSections(RESUME);
    expect(sections.header.join(" ")).toContain("Jane Doe");
    expect(sections.experience.length).toBeGreaterThan(4);
    expect(sections.skills.join(" ")).toContain("Node.js");
    expect(sections.education.length).toBeGreaterThan(0);
  });
});

describe("parseResumeLocal", () => {
  const parsed = parseResumeLocal(RESUME);

  it("extracts contact details from the body", () => {
    expect(parsed.name).toBe("Jane Doe");
    expect(parsed.email).toBe("jane.doe@example.com");
    expect(parsed.phone.replace(/\D/g, "")).toContain("4155550134");
    expect(parsed.urls.join(" ")).toContain("github.com/janedoe");
  });

  it("keeps each job as one entry with its dates and bullets", () => {
    expect(parsed.experience).toHaveLength(2);
    const [first, second] = parsed.experience;
    expect(first.title).toBe("Senior Software Engineer");
    expect(first.employer).toBe("Acme Corp");
    expect(first.dateDisplay).toBe("Jan 2021 – Present");
    expect(first.present).toBe(true);
    expect(first.bullets).toHaveLength(2);
    expect(second.title).toBe("Software Engineer");
    expect(second.dateDisplay).toBe("Jun 2017 – Dec 2020");
    expect(second.present).toBe(false);
  });

  it("never mistakes a bullet for a new job entry", () => {
    const bullets = parsed.experience.flatMap((e) => e.bullets);
    for (const e of parsed.experience) {
      expect(e.title).not.toMatch(/^Built|^Reduced|^Developed/);
    }
    expect(bullets.some((b) => /Built event-driven/.test(b))).toBe(true);
  });

  it("parses skills, education and summary", () => {
    expect(parsed.skills).toEqual(expect.arrayContaining(["Node.js", "TypeScript", "Kubernetes"]));
    expect(parsed.education[0].degree).toBe("BSc");
    expect(parsed.education[0].institution).toContain("University of Texas");
    expect(parsed.summary).toContain("distributed systems");
  });

  it("de-duplicates skills case-insensitively", () => {
    const dup = parseResumeLocal("SKILLS\nNode.js, node.js, NODE.JS, Python");
    expect(dup.skills).toHaveLength(2);
  });

  it("is fast and deterministic", () => {
    const first = parseResumeLocal(RESUME);
    const second = parseResumeLocal(RESUME);
    expect(first.parseMs).toBeLessThan(2000);
    expect(first.skills).toEqual(second.skills);
    expect(first.experience).toEqual(second.experience);
  });

  it("tolerates an empty or junk resume without throwing", () => {
    for (const input of ["", null, undefined, "   \n\n  ", "!!! ??? 12345"]) {
      const out = parseResumeLocal(input);
      expect(out.experience).toEqual([]);
      expect(out.skills).toEqual([]);
    }
  });
});
