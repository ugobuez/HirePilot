/**
 * Part 1 — the HTTP contract of /extract-resume:
 *  - fastParse ON  (default): local parsing only, zero provider calls, < 2s
 *  - fastParse OFF: local parsing + EXACTLY ONE provider call (never two)
 *
 * The old flow made two LLM calls per upload (profile extraction plus a separate
 * "write me a summary" call), and a second repair call whenever the JSON was bad.
 */
import { jest } from "@jest/globals";
import request from "supertest";
import config from "../config/index.js";
import { _reset } from "../services/llmRouter.js";
import { app } from "../server.js";
import { startTestDb, stopTestDb, clearTestDb } from "./helpers/db.js";

const RESUME = `Jane Doe
jane.doe@example.com | (415) 555-0134 | San Francisco, CA
https://github.com/janedoe

SUMMARY
Senior backend engineer with 9 years building distributed systems.

EXPERIENCE
Senior Software Engineer, Acme Corp, San Francisco, CA
Jan 2021 - Present
- Built event-driven services in Node.js and Kubernetes.
- Cut p99 latency 45% with Redis caching.

EDUCATION
BSc in Computer Science, University of Texas, Aug 2013 - May 2017

SKILLS
Node.js, TypeScript, Python, PostgreSQL, Redis, Docker, Kubernetes, AWS
`;

const realProviders = config.providers;
const realLlm = { ...config.llm };

let providerCalls = [];
const stubProvider = (reply) => {
  providerCalls = [];
  globalThis.fetch = jest.fn(async (url, init = {}) => {
    providerCalls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify(reply),
    };
  });
};

const geminiReply = (text) => ({ candidates: [{ content: { parts: [{ text }] } }] });

const signup = async (email) => {
  const res = await request(app)
    .post("/api/v1/auth/signup")
    .send({ email, password: "Password123!" })
    .expect(201);
  return res.body.token;
};

const upload = (token, query = "") =>
  request(app)
    .post(`/api/v1/auth/extract-resume${query}`)
    .set("Authorization", `Bearer ${token}`)
    .attach("resume", Buffer.from(RESUME, "utf-8"), {
      filename: "jane-doe.txt",
      contentType: "text/plain",
    });

beforeAll(async () => {
  await startTestDb();
});

beforeEach(() => {
  _reset();
  config.providers = {
    groq: { apiKey: "gsk_fake", fastModel: "llama-3.1-8b-instant", largeModel: "llama-3.3-70b-versatile" },
    openrouter: { apiKey: "sk-or-v1-fake", models: ["vendor/model-a:free"] },
    gemini: { apiKey: "AIzaFake", model: "gemini-2.0-flash" },
  };
  config.llm = { ...realLlm, maxRetriesPerProvider: 0, cacheTtlMs: -1, budgetPerMin: 1000 };
  stubProvider(geminiReply("{}"));
});

afterEach(async () => {
  await clearTestDb();
  _reset();
});

afterAll(async () => {
  config.providers = realProviders;
  config.llm = realLlm;
  await stopTestDb();
});

describe("POST /api/v1/auth/extract-resume", () => {
  it("fastParse ON (default): zero provider calls, under 2 seconds", async () => {
    const token = await signup("fast-on@hirepilot.dev");
    const started = Date.now();
    const res = await upload(token).expect(200);
    const elapsed = Date.now() - started;

    expect(providerCalls).toHaveLength(0);
    expect(elapsed).toBeLessThan(2000);
    expect(res.body.parsing).toMatchObject({ fastParse: true, mode: "local", llmCalls: 0, source: "local" });
    expect(res.body.profile.fullName).toBe("Jane Doe");
    expect(res.body.profile.email).toBe("jane.doe@example.com");
    expect(res.body.profile.skills).toContain("Node.js");
    expect(res.body.profile.summary).toContain("backend engineer");
  });

  it("fastParse OFF: exactly one provider call", async () => {
    const token = await signup("fast-off@hirepilot.dev");
    stubProvider(
      geminiReply(
        JSON.stringify({
          fullName: "Jane Doe",
          summary: "Staff backend engineer focused on distributed systems.",
          skills: ["Node.js", "Kubernetes", "Rust"],
          yearsOfExperience: 9,
        })
      )
    );

    const res = await upload(token, "?fastParse=false").expect(200);

    expect(providerCalls).toHaveLength(1); // not two, not three
    expect(res.body.parsing).toMatchObject({ fastParse: false, mode: "local+llm", llmCalls: 1, source: "llm" });
    expect(res.body.profile.summary).toBe("Staff backend engineer focused on distributed systems.");
    expect(res.body.profile.yearsOfExperience).toBe(9);
    expect(res.body.profile.skills).toContain("Node.js");
    expect(res.body.profile.skills).not.toContain("Rust"); // invented, dropped
  });

  it("fastParse OFF with a dead provider still answers, using the local parse", async () => {
    const token = await signup("fast-dead@hirepilot.dev");
    globalThis.fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      headers: { get: () => null },
      text: async () => JSON.stringify({ error: "invalid key" }),
    }));

    const res = await upload(token, "?fastParse=false").expect(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(res.body.parsing).toMatchObject({ mode: "local-only", llmCalls: 0, source: "local" });
    expect(res.body.profile.fullName).toBe("Jane Doe");
  });

  it("rejects a request with no file", async () => {
    const token = await signup("fast-nofile@hirepilot.dev");
    await request(app)
      .post("/api/v1/auth/extract-resume")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
    expect(providerCalls).toHaveLength(0);
  });
});
