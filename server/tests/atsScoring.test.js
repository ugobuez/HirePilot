import { scoreJob, parseJob, splitRequirements, rescScanTarget, DEFAULT_WEIGHTS } from "../services/atsScoring.js";

const RESUME = `Jane Doe
Senior backend engineer with 9 years building distributed systems.

EXPERIENCE
Senior Software Engineer, Acme Corp
Jan 2021 - Present
Built event-driven services in Node.js and TypeScript.
Reduced p99 latency 45% with Redis caching and Postgres tuning.

SKILLS
Node.js, TypeScript, PostgreSQL, Redis, Docker, Kubernetes, AWS, Terraform, GraphQL
`;

const PROFILE = {
  resumeText: RESUME,
  skillsList: ["Node.js", "TypeScript", "PostgreSQL", "Redis", "Docker", "Kubernetes", "AWS", "Terraform", "GraphQL"],
  targetTitles: ["Senior Backend Engineer"],
  yearsOfExperience: 9,
  authorizedCountries: ["United States"],
  needsSponsorship: false,
  remotePreference: "remote",
};

const GOOD_JOB = {
  title: "Senior Backend Engineer",
  location: "Remote (US)",
  description: `Requirements:
- 5+ years of experience with Node.js and TypeScript
- Strong knowledge of PostgreSQL and Redis
- Experience with Docker and Kubernetes
Nice to have:
- GraphQL experience
- Terraform
We are unable to sponsor visas.`,
};

const WEAK_JOB = {
  title: "Registered Nurse",
  location: "London, UK",
  description: `Requirements:
- Must have 3+ years of clinical nursing experience
- Knowledge of patient triage and phlebotomy
No visa sponsorship.`,
};

describe("parseJob", () => {
  it("separates must-have and nice-to-have requirements", () => {
    const parsed = parseJob(GOOD_JOB);
    const must = parsed.mustHave.map((t) => t.canonical);
    const nice = parsed.niceToHave.map((t) => t.canonical);
    expect(must).toEqual(expect.arrayContaining(["node.js", "typescript", "postgresql", "redis"]));
    expect(nice).toEqual(expect.arrayContaining(["graphql"]));
    // A must-have never also appears in the nice-to-have list.
    for (const k of nice) expect(must).not.toContain(k);
  });

  it("never treats whole sentences or visa wording as skills", () => {
    const parsed = parseJob({
      title: "Senior Backend Engineer",
      description:
        "We are hiring a Senior Backend Engineer. We are unable to sponsor visas.\nRequirements:\n- Strong knowledge of PostgreSQL",
    });
    const terms = [...parsed.mustHave, ...parsed.niceToHave].map((t) => t.display);
    expect(terms).toContain("PostgreSQL");
    for (const t of terms) {
      expect(t.split(" ").length).toBeLessThanOrEqual(4);
      expect(t.toLowerCase()).not.toMatch(/sponsor|visa|we are|hiring/);
    }
  });

  it("detects years, visa stance, and remote", () => {
    const parsed = parseJob(GOOD_JOB);
    expect(parsed.yearsRequired).toBe(5);
    expect(parsed.visaStance).toBe("none");
    expect(parsed.remote).toBe(true);
  });

  it("splits requirement lines by section", () => {
    const { mustHave, niceToHave } = splitRequirements("Requirements:\n- Node.js\nNice to have:\n- Rust");
    expect(mustHave.map((m) => m.line)).toContain("Node.js");
    expect(niceToHave.map((n) => n.line)).toContain("Rust");
  });
});

describe("scoreJob honesty", () => {
  it("scores a strong match above the threshold", () => {
    const result = scoreJob(GOOD_JOB, PROFILE, { threshold: 70 });
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.pass).toBe(true);
    expect(result.mustHaveMatched.length).toBeGreaterThanOrEqual(4);
    expect(result.reasons.length).toBeGreaterThan(3);
  });

  it("does not invent a constant floor for an empty profile", () => {
    const empty = scoreJob(GOOD_JOB, {}, { threshold: 70 });
    expect(empty.mustHaveMatched).toHaveLength(0);
    expect(empty.score).toBeLessThan(30);
    expect(empty.pass).toBe(false);
  });

  it("keeps a mismatched job score low", () => {
    const weak = scoreJob(WEAK_JOB, PROFILE, { threshold: 70 });
    expect(weak.score).toBeLessThan(40);
    expect(weak.pass).toBe(false);
    expect(weak.skipReasons.length).toBeGreaterThan(0);
  });

  it("returns an explainable score between 0 and 100", () => {
    const result = scoreJob(GOOD_JOB, PROFILE);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    for (const [, cat] of Object.entries(result.categories)) {
      expect(cat.score).toBeGreaterThanOrEqual(0);
      expect(cat.score).toBeLessThanOrEqual(100);
      expect(typeof cat.weight).toBe("number");
    }
    // Category weights add up to the documented total.
    const total = Object.values(result.categories).reduce((sum, c) => sum + c.weight, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it("counts every keyword exactly once across categories", () => {
    const result = scoreJob(GOOD_JOB, PROFILE);
    const all = [
      ...result.mustHaveMatched,
      ...result.mustHaveMissing,
      ...result.niceToHaveMatched,
      ...result.niceToHaveMissing,
    ].map((k) => k.canonical);
    expect(new Set(all).size).toBe(all.length);
    const overlap = result.mustHaveMissing.filter((m) =>
      result.niceToHaveMatched.some((n) => n.canonical === m.canonical)
    );
    expect(overlap).toHaveLength(0);
  });

  it("weighs must-haves higher than nice-to-haves", () => {
    expect(DEFAULT_WEIGHTS.mustHave).toBeGreaterThan(DEFAULT_WEIGHTS.niceToHave);
  });

  it("penalises keyword stuffing instead of rewarding it", () => {
    const stuffed = {
      ...PROFILE,
      resumeText: `${RESUME}\nKubernetes Kubernetes Kubernetes Kubernetes Kubernetes Kubernetes`,
    };
    const honest = scoreJob(GOOD_JOB, PROFILE);
    const spam = scoreJob(GOOD_JOB, stuffed);
    expect(spam.density.stuffed).toBe(true);
    expect(spam.score).toBeLessThanOrEqual(honest.score);
  });

  it("flags unclear sponsorship for human review", () => {
    const unclear = scoreJob(
      { title: "Backend Engineer", description: "Requirements:\n- Node.js" },
      { ...PROFILE, needsSponsorship: true }
    );
    expect(unclear.needsReview).toBe(true);
  });
});

describe("rescScanTarget", () => {
  it("reports the real ceiling and never fabricates skills", () => {
    const scored = scoreJob(GOOD_JOB, PROFILE);
    const resc = rescScanTarget(GOOD_JOB, PROFILE, scored.score);
    expect(resc.rescanned).toBe(scored.score);
    expect(Array.isArray(resc.blockedByMissingSkills)).toBe(true);
    expect(resc.note).toMatch(/invented|already supported/i);
    expect(["apply", "skip"]).toContain(resc.decision);
  });
});
