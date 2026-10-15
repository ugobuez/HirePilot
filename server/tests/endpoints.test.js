/**
 * Endpoint inventory integration tests.
 *
 * Covers every registered route on the Express app with success, auth (401),
 * invalid input (400), missing resource (404), CORS, and CRUD-persistence cases.
 *
 * Hermetic constraints:
 *  - mongodb-memory-server backs all DB writes (same mongoose connection the
 *    Atlas path uses), so the CRUD round-trip proves real persistence.
 *  - No LLM key is configured, so every AI path falls back to its local
 *    deterministic scorer (asserted via shape, not values).
 *  - Job sources are disabled in this env, so /api/jobs and /api/scrape-jobs
 *    return empty sets without touching the network.
 *  - The automation SUCCESS paths for /run, /scan, /preflight, /auto-apply/run
 *    and /auto-apply/jobs invoke `checkPlaywright()`, which launches a real
 *    Chromium against google.com. Those routes are therefore asserted for
 *    their auth guard (401) here; the browser/network success path is out of
 *    scope for a hermetic suite (see ENDPOINTS.md).
 */
import request from "supertest";
import { app } from "../server.js";
import { startTestDb, stopTestDb, clearTestDb } from "./helpers/db.js";

let token;
let otherToken;

beforeAll(async () => {
  await startTestDb();
});

afterEach(async () => {
  await clearTestDb();
  token = undefined;
  otherToken = undefined;
});

afterAll(async () => {
  await stopTestDb();
});

/** Sign up a throwaway user and return its bearer token. */
const signup = async (email, password = "Sup3rSecret!") => {
  const res = await request(app)
    .post("/api/v1/auth/signup")
    .send({ email, password, fullName: "Endpoint Tester" })
    .expect(201);
  return res.body.token;
};

describe("root, liveness and readiness", () => {
  it("serves the root banner with health path", async () => {
    const res = await request(app).get("/").expect(200);
    expect(res.body.name).toBe("HirePilot API");
    expect(res.body.status).toBe("running");
    expect(res.body.health).toBe("/api/health");
  });

  it("GET /api/health/live is dependency-free and never leaks config", async () => {
    const res = await request(app).get("/api/health/live").expect(200);
    expect(res.body.status).toBe("alive");
    expect(typeof res.body.uptimeSeconds).toBe("number");
    expect(res.body).toHaveProperty("timestamp");
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/api[_-]?key/i);
    expect(body).not.toMatch(/jwt|secret|mongodb\+srv/i);
  });

  it("GET /api/health/ready reports readiness against the connected DB", async () => {
    const res = await request(app).get("/api/health/ready").expect(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.database).toBe("connected");
    // Readiness must not expose the URI or a stack trace.
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/mongodb\+srv|27017|atlas/i);
  });

  it("returns JSON 404 for an unknown route", async () => {
    const res = await request(app).get("/api/nope-not-a-route").expect(404);
    expect(res.body.error).toBe("Not found");
    expect(res.body.path).toBe("/api/nope-not-a-route");
  });
});

describe("CORS", () => {
  it("answers a preflight from an allowed origin without a wildcard", async () => {
    const res = await request(app)
      .options("/api/health")
      .set("Origin", "https://hire-pilot-job.vercel.app")
      .set("Access-Control-Request-Method", "GET")
      .expect(200);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "https://hire-pilot-job.vercel.app"
    );
    expect(res.headers["access-control-allow-origin"]).not.toBe("*");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("blocks a disallowed origin", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", "https://evil.example.com")
      .send({ email: "a@b.com", password: "x" });
    // Rejected origin never receives an ACAO header (browser blocks it).
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("auth", () => {
  it("signs up a user and returns a token + user object", async () => {
    token = await signup("auth-ok@example.com");
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);
  });

  it("rejects a duplicate signup", async () => {
    await signup("dupe@example.com");
    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ email: "dupe@example.com", password: "Sup3rSecret!" })
      .expect(400);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it("rejects signup with missing credentials", async () => {
    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ email: "nopass@example.com" })
      .expect(400);
    expect(res.body.error).toMatch(/Email and password are required/i);
  });

  it("logs in with correct credentials", async () => {
    await signup("login@example.com");
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "login@example.com", password: "Sup3rSecret!" })
      .expect(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe("login@example.com");
    expect(res.body.user).not.toHaveProperty("password");
  });

  it("rejects a wrong password with 401", async () => {
    await signup("wrong@example.com");
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "wrong@example.com", password: "NotThePassword" })
      .expect(401);
    expect(res.body.error).toBe("Invalid credentials");
  });

  it("rejects login with missing fields", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "x@y.com" })
      .expect(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it("GET /me rejects a missing token", async () => {
    await request(app).get("/api/v1/auth/me").expect(401);
  });

  it("GET /me rejects a malformed token", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer not.a.real.token")
      .expect(401);
    expect(res.body.error).toMatch(/token/i);
  });

  it("GET /me returns the current user", async () => {
    token = await signup("me@example.com");
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.user.email).toBe("me@example.com");
    expect(res.body.user).not.toHaveProperty("password");
  });

  it("PUT /onboarding requires a token", async () => {
    await request(app)
      .put("/api/v1/auth/onboarding")
      .send({ baseResumeText: "x" })
      .expect(401);
  });

  it("PUT /onboarding persists base resume + onboarding details", async () => {
    token = await signup("onboard@example.com");
    const res = await request(app)
      .put("/api/v1/auth/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .send({
        baseResumeText: "I build things with React and Node.",
        onboardingDetails: { fullName: "Onboard User", skillsList: ["React"] },
      })
      .expect(200);
    expect(res.body.user.baseResumeText).toContain("React");
    expect(res.body.user.onboardingDetails.fullName).toBe("Onboard User");

    // Prove it persisted: re-read the profile.
    const prof = await request(app)
      .get("/api/v1/auth/profile")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(prof.body.baseResumeText).toContain("React");
  });

  it("GET /profile requires a token", async () => {
    await request(app).get("/api/v1/auth/profile").expect(401);
  });

  it("GET /profile returns onboarding details + metrics", async () => {
    token = await signup("profile@example.com");
    const res = await request(app)
      .get("/api/v1/auth/profile")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveProperty("onboardingDetails");
    expect(res.body).toHaveProperty("settings");
    expect(res.body).toHaveProperty("baseResumeText");
    expect(res.body.metrics).toHaveProperty("profileCompleteness");
    expect(typeof res.body.metrics.resumeScore).toBe("number");
  });

  it("POST /forgot-password rejects a missing email", async () => {
    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({})
      .expect(400);
    expect(res.body.error).toMatch(/email is required/i);
  });

  it("POST /forgot-password never reveals whether the email exists", async () => {
    const unknown = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "ghost@example.com" })
      .expect(200);
    await signup("known@example.com");
    const known = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "known@example.com" })
      .expect(200);
    // Same message either way — no user enumeration.
    expect(unknown.body.message).toBe(known.body.message);
  });

  it("POST /extract-resume rejects a missing token", async () => {
    await request(app).post("/api/v1/auth/extract-resume").expect(401);
  });
});

describe("applications CRUD (persistence round-trip)", () => {
  it("rejects list without a token", async () => {
    await request(app).get("/api/v1/applications").expect(401);
  });

  it("creates, reads, updates, and deletes an application", async () => {
    token = await signup("crud@example.com");

    // CREATE
    const created = await request(app)
      .post("/api/v1/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({
        jobTitle: "Senior Engineer",
        company: "Acme Corp",
        location: "Remote",
        jobDescription: "Build APIs",
        source: "Manual",
      })
      .expect(201);
    expect(created.body._id).toBeTruthy();
    expect(created.body.status).toBe("Scraped");
    expect(created.body.history).toHaveLength(1);
    const id = created.body._id;

    // READ back — proves the write persisted to the DB.
    const list = await request(app)
      .get("/api/v1/applications")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]._id).toBe(id);
    expect(list.body[0].company).toBe("Acme Corp");

    // UPDATE full document
    const updated = await request(app)
      .put(`/api/v1/applications/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ company: "Acme Corp (renamed)" })
      .expect(200);
    expect(updated.body.company).toBe("Acme Corp (renamed)");

    // UPDATE status (whitelisted) pushes history
    const st = await request(app)
      .put(`/api/v1/applications/${id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "Applied", note: "Submitted online" })
      .expect(200);
    expect(st.body.status).toBe("Applied");
    expect(st.body.appliedAt).toBeTruthy();
    expect(st.body.history.length).toBe(2);

    // DELETE
    const del = await request(app)
      .delete(`/api/v1/applications/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(del.body.message).toMatch(/deleted/i);

    // Confirm it is gone from a fresh read.
    const after = await request(app)
      .get("/api/v1/applications")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(after.body).toHaveLength(0);
  });

  it("rejects an invalid status with 400", async () => {
    token = await signup("badstatus@example.com");
    const created = await request(app)
      .post("/api/v1/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobTitle: "X", company: "Y" })
      .expect(201);
    const res = await request(app)
      .put(`/api/v1/applications/${created.body._id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "NotARealStatus" })
      .expect(400);
    expect(res.body.error).toMatch(/Invalid status/i);
  });

  it("returns 404 when updating a missing application", async () => {
    token = await signup("missing404@example.com");
    const fakeId = "64b000000000000000000000";
    await request(app)
      .put(`/api/v1/applications/${fakeId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "Applied" })
      .expect(404);
  });

  it("returns 404 when deleting an already-deleted application", async () => {
    token = await signup("twicedel@example.com");
    const created = await request(app)
      .post("/api/v1/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobTitle: "A", company: "B" })
      .expect(201);
    const id = created.body._id;
    await request(app)
      .delete(`/api/v1/applications/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    await request(app)
      .delete(`/api/v1/applications/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });

  it("scopes applications to their owner (cross-user isolation)", async () => {
    token = await signup("owner@example.com");
    const created = await request(app)
      .post("/api/v1/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobTitle: "Owner Job", company: "OwnerCo" })
      .expect(201);
    const id = created.body._id;

    otherToken = await signup("intruder@example.com");

    // Another user's list must not contain this application.
    const list = await request(app)
      .get("/api/v1/applications")
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(200);
    expect(list.body).toHaveLength(0);

    // Nor can they mutate or delete it (userId is scoped in the query).
    await request(app)
      .put(`/api/v1/applications/${id}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ company: "Hijacked" })
      .expect(404);
    await request(app)
      .delete(`/api/v1/applications/${id}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(404);

    // Owner still sees it untouched.
    const ownerView = await request(app)
      .get("/api/v1/applications")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(ownerView.body).toHaveLength(1);
    expect(ownerView.body[0].company).toBe("OwnerCo");
  });

  it("POST /manual-apply creates a Scraped application", async () => {
    token = await signup("manual@example.com");
    const res = await request(app)
      .post("/api/v1/applications/manual-apply")
      .set("Authorization", `Bearer ${token}`)
      .send({
        jobTitle: "Designer",
        company: "Design Co",
        location: "Lagos",
        jobDescription: "Design things",
      })
      .expect(201);
    expect(res.body.status).toBe("Scraped");
    expect(res.body.source).toBe("Manual");
    expect(res.body.history[0].note).toMatch(/Manually added/i);
  });

  it("GET /stats returns pipeline analytics", async () => {
    token = await signup("stats@example.com");
    await request(app)
      .post("/api/v1/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobTitle: "Dev", company: "StatsCo", status: "Applied" })
      .expect(201);

    const res = await request(app)
      .get("/api/v1/applications/stats")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.applied).toBeGreaterThanOrEqual(1);
    expect(res.body).toHaveProperty("byStatus");
    expect(res.body).toHaveProperty("timeline");
    expect(Array.isArray(res.body.timeline)).toBe(true);
  });

  it("POST /:id/tailor returns 404 for a missing application", async () => {
    token = await signup("tailormiss@example.com");
    await request(app)
      .post("/api/v1/applications/64b000000000000000000000/tailor")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });

  it("POST /:id/tailor returns 400 when no master resume exists", async () => {
    token = await signup("tailor0@example.com");
    const created = await request(app)
      .post("/api/v1/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobTitle: "T", company: "C", jobDescription: "Stuff" })
      .expect(201);
    const res = await request(app)
      .post(`/api/v1/applications/${created.body._id}/tailor`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
    expect(res.body.error).toMatch(/master resume/i);
  });
});

describe("jobs", () => {
  it("GET /api/jobs returns an empty paginated envelope (sources off)", async () => {
    const res = await request(app).get("/api/jobs").expect(200);
    expect(Array.isArray(res.body.jobs)).toBe(true);
    expect(res.body.jobs).toHaveLength(0);
    expect(res.body.total).toBe(0);
    expect(res.body.page).toBe(1);
    expect(res.body).toHaveProperty("hasMore");
  });

  it("GET /api/jobs/search echoes filters", async () => {
    const res = await request(app)
      .get("/api/jobs/search?query=react&country=US&remote=true")
      .expect(200);
    expect(res.body.filters.query).toBe("react");
    expect(res.body.filters.country).toBe("US");
    expect(res.body.filters.remote).toBe(true);
    expect(Array.isArray(res.body.jobs)).toBe(true);
  });

  it("GET /api/jobs/sources returns registry metadata with no network", async () => {
    const res = await request(app).get("/api/jobs/sources").expect(200);
    expect(typeof res.body.total).toBe("number");
    expect(Array.isArray(res.body.sources)).toBe(true);
  });

  it("GET /api/jobs/for-user requires a token", async () => {
    await request(app).get("/api/jobs/for-user").expect(401);
  });

  it("GET /api/jobs/for-user returns scored (empty) jobs for a user", async () => {
    token = await signup("foruser@example.com");
    const res = await request(app)
      .get("/api/jobs/for-user")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body.jobs)).toBe(true);
    expect(res.body).toHaveProperty("dedupedFrom");
    expect(res.body).toHaveProperty("total");
  });

  it("GET /api/jobs/sections requires a token", async () => {
    await request(app).get("/api/jobs/sections").expect(401);
  });

  it("GET /api/jobs/sections returns the dashboard section envelope", async () => {
    token = await signup("sections@example.com");
    const res = await request(app)
      .get("/api/jobs/sections")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body.recommended)).toBe(true);
    expect(Array.isArray(res.body.sections)).toBe(true);
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("minAts");
    expect(res.body).toHaveProperty("sources");
  });
});

describe("automation", () => {
  // The SUCCESS paths for /run, /scan, /preflight, /auto-apply/run and
  // /auto-apply/jobs launch a real Chromium (checkPlaywright) against
  // google.com, so only the auth guard is asserted here (see file header).
  it("GET /preflight requires a token (401)", async () => {
    await request(app).get("/api/v1/automation/preflight").expect(401);
  });

  it("POST /run requires a token (401)", async () => {
    await request(app)
      .post("/api/v1/automation/run")
      .send({ dryRun: true })
      .expect(401);
  });

  it("POST /scan requires a token (401)", async () => {
    await request(app).post("/api/v1/automation/scan").expect(401);
  });

  it("POST /auto-apply/run requires a token (401)", async () => {
    await request(app)
      .post("/api/v1/automation/auto-apply/run")
      .send({ dryRun: true })
      .expect(401);
  });

  it("POST /auto-apply/jobs requires a token (401)", async () => {
    await request(app)
      .post("/api/v1/automation/auto-apply/jobs")
      .send({ jobs: [] })
      .expect(401);
  });

  it("GET /auto-apply requires a token (401)", async () => {
    await request(app).get("/api/v1/automation/auto-apply").expect(401);
  });

  it("GET /auto-apply returns settings + daily limit envelope", async () => {
    token = await signup("aastatus@example.com");
    const res = await request(app)
      .get("/api/v1/automation/auto-apply")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveProperty("settings");
    expect(typeof res.body.dailyLimit).toBe("number");
    expect(typeof res.body.remaining).toBe("number");
    expect(res.body.remaining).toBe(res.body.dailyLimit);
    expect(res.body.lastAutoApplyAt).toBeNull();
  });

  it("PUT /auto-apply persists settings across a fresh read", async () => {
    token = await signup("aaput@example.com");
    const res = await request(app)
      .put("/api/v1/automation/auto-apply")
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: true, minAts: 85, dailyLimit: 5, remoteOnly: true })
      .expect(200);
    expect(res.body.settings.autoApplyEnabled).toBe(true);
    expect(res.body.settings.minAts).toBe(85);

    // Fresh read proves persistence.
    const check = await request(app)
      .get("/api/v1/automation/auto-apply")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(check.body.settings.autoApplyEnabled).toBe(true);
    expect(check.body.settings.minAts).toBe(85);
    expect(check.body.settings.remoteOnly).toBe(true);
  });

  it("PUT /auto-apply requires a token (401)", async () => {
    await request(app)
      .put("/api/v1/automation/auto-apply")
      .send({ enabled: true })
      .expect(401);
  });
});

describe("AI analyze", () => {
  it("rejects a request with no resume file (400)", async () => {
    const res = await request(app)
      .post("/api/analyze")
      .field("jobDesc", "We need React.")
      .expect(400);
    expect(res.body.error).toMatch(/resume file is required/i);
  });

  it("rejects a resume with no job description (400)", async () => {
    const res = await request(app)
      .post("/api/analyze")
      .attach("resume", Buffer.from("Jane Doe. React, Node."), {
        filename: "resume.txt",
        contentType: "text/plain",
      })
      .expect(400);
    expect(res.body.error).toMatch(/job description is required/i);
  });

  it("analyzes a resume + job description using the local fallback", async () => {
    const res = await request(app)
      .post("/api/analyze")
      .field("jobDesc", "Seeking a React and Node.js engineer for APIs.")
      .attach("resume", Buffer.from("Jane Doe. Skills: React, Node.js, SQL."), {
        filename: "resume.txt",
        contentType: "text/plain",
      })
      .expect(200);
    expect(typeof res.body.resumeText).toBe("string");
    expect(res.body.parsedResume).toHaveProperty("skills");
    expect(Array.isArray(res.body.missingSkills)).toBe(true);
    expect(typeof res.body.matchScore).toBe("number");
    expect(typeof res.body.coverLetter).toBe("string");
    expect(res.body.coverLetter.length).toBeGreaterThan(0);
  });
});

describe("scrape and resume upload", () => {
  it("POST /api/scrape-jobs reports zero saved when sources are off", async () => {
    const res = await request(app).post("/api/scrape-jobs").expect(200);
    expect(res.body.total).toBe(0);
    expect(res.body.saved).toBe(0);
    expect(res.body.message).toMatch(/Saved 0\/0 jobs/i);
  });

  it("POST /api/resume/upload-resume rejects a missing file (400)", async () => {
    const res = await request(app)
      .post("/api/resume/upload-resume")
      .expect(400);
    expect(res.body.error).toMatch(/no file uploaded/i);
  });

  it("POST /api/resume/upload-resume rejects a disallowed file type", async () => {
    const res = await request(app)
      .post("/api/resume/upload-resume")
      .attach("resume", Buffer.from("MZbinary"), {
        filename: "payload.exe",
        contentType: "application/x-msdownload",
      });
    expect([400, 500]).toContain(res.status);
    expect(res.status).not.toBe(200);
    expect(res.body.error).toBeTruthy();
  });
});







