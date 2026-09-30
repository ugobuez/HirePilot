/**
 * Part 1 — LLM routing: structured attempt logs, circuit breaking, live model-id
 * verification, provider-specific JSON mode with local repair, a self-test that
 * reports real PASS/FAIL, and strict fastParse gating.
 *
 * Every provider call goes through a stubbed global fetch, and provider config
 * is swapped for fake keys: no test touches a real provider or needs a real key.
 */
import { jest } from "@jest/globals";
import { z } from "zod";
import config from "../config/index.js";
import logger from "../utils/logger.js";
import {
  _reset,
  buildChain,
  circuitState,
  complete,
  completeJson,
  deadModelList,
  health,
  isModelDead,
  jsonSupports,
  markModelDead,
  repairJson,
  scrubError,
  setJsonSupport,
  verifyModelLists,
} from "../services/llmRouter.js";
import { runSelfTest } from "../services/llmSelfTest.js";
import { parseResume } from "../services/resumeParser.js";
import {
  extractProfileFromResume,
  generateProfessionalSummary,
} from "../middleware/services/profileExtractionService.js";

const GROQ_FAST = "llama-3.1-8b-instant";
const GROQ_LARGE = "llama-3.3-70b-versatile";
const OR_MODEL = "vendor/model-a:free";
const GEMINI_MODEL = "gemini-2.0-flash";
const GROQ_KEY = "gsk_fake_key_for_tests";
const OR_KEY = "sk-or-v1-fake-key-tests";
const GEMINI_KEY = "AIzaFakeKeyForTests";

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

const fakeRes = ({ status = 200, body = {} } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});

const chat = (text) => ({ choices: [{ message: { content: text } }], usage: { total_tokens: 11 } });
const geminiReply = (text) => ({
  candidates: [{ content: { parts: [{ text }] } }],
  usageMetadata: { totalTokenCount: 7 },
});

/** Records every outbound call so tests can assert how many were made. */
let calls = [];
const stubFetch = (handler) => {
  calls = [];
  globalThis.fetch = jest.fn(async (url, init = {}) => {
    calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    return handler(String(url), init);
  });
  return calls;
};

/** Model-list and chat endpoints, answered per provider. */
const routeByProvider = (overrides = {}) => (url) => {
  if (url.includes(":generateContent")) return overrides.gemini ?? fakeRes({ body: geminiReply("OK") });
  if (url.startsWith("https://api.groq.com/openai/v1/models")) {
    return overrides.groqList ?? fakeRes({ body: { data: [{ id: GROQ_FAST }, { id: GROQ_LARGE }] } });
  }
  if (url === "https://openrouter.ai/api/v1/models") {
    return (
      overrides.openrouterList ??
      fakeRes({ body: { data: [{ id: OR_MODEL, supported_parameters: ["response_format"] }] } })
    );
  }
  if (url.startsWith("https://generativelanguage.googleapis.com/v1beta/models")) {
    return overrides.geminiList ?? fakeRes({ body: { models: [{ name: `models/${GEMINI_MODEL}` }] } });
  }
  if (url.startsWith("https://api.groq.com")) return overrides.groq ?? fakeRes({ body: chat("OK") });
  if (url.startsWith("https://openrouter.ai")) return overrides.openrouter ?? fakeRes({ body: chat("OK") });
  return fakeRes({ body: chat("OK") });
};

beforeEach(() => {
  _reset();
  config.providers = {
    groq: { apiKey: GROQ_KEY, fastModel: GROQ_FAST, largeModel: GROQ_LARGE },
    openrouter: { apiKey: OR_KEY, models: [OR_MODEL] },
    gemini: { apiKey: GEMINI_KEY, model: GEMINI_MODEL },
  };
  config.llm = {
    ...realLlm,
    maxRetriesPerProvider: 0, // no backoff sleeps in tests
    budgetPerMin: 1000,
    cacheTtlMs: -1, // never serve a cached completion
    circuitThreshold: 3,
    circuitCooldownMs: 30_000,
  };
  calls = [];
});

afterEach(() => {
  _reset();
  jest.restoreAllMocks();
});

afterAll(() => {
  config.providers = realProviders;
  config.llm = realLlm;
});

describe("1. attempt logging is structured and redacted", () => {
  it("logs provider, model, status, error type, latency and a scrubbed error", async () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => {});
    stubFetch(() => fakeRes({ status: 401, body: { error: `Invalid API Key: ${GROQ_KEY}` } }));

    const res = await complete("system", "prompt", {
      tier: "fast",
      validate: z.object({ summary: z.string() }),
      fallback: () => ({ summary: "local" }),
    });
    expect(res.source).toBe("local");

    const attempts = warn.mock.calls.filter(([msg]) => msg === "llm attempt");
    expect(attempts).toHaveLength(buildChain("fast").length);
    for (const [, meta] of attempts) {
      expect(meta.provider).toEqual(expect.any(String));
      expect(meta.model).toEqual(expect.any(String));
      expect(meta.status).toBe(401);
      expect(meta.errorType).toBe("auth");
      expect(typeof meta.latencyMs).toBe("number");
      expect(typeof meta.err).toBe("string");
    }

    // No credential survives into the log payload.
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(GROQ_KEY);
    expect(logged).toContain("[redacted]");
  });

  it("scrubError removes credentials, emails and connection strings", () => {
    const scrubbed = scrubError(
      `key=${GROQ_KEY} Bearer ${OR_KEY} at jane.doe@example.com via mongodb+srv://u:p@cluster.mongodb.net`
    );
    expect(scrubbed).not.toMatch(/gsk_fake|sk-or-v1|jane\.doe@|mongodb\+srv/);
    expect(scrubbed).toContain("[redacted]");
    expect(scrubbed).toContain("[email]");
  });

  it("never logs the prompt or the resume", async () => {
    const info = jest.spyOn(logger, "info").mockImplementation(() => {});
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => {});
    stubFetch(() => fakeRes({ body: chat(JSON.stringify({ summary: "ok" })) }));
    await complete("SYSTEM PROMPT", `RESUME: ${RESUME}`, {
      tier: "fast",
      validate: z.object({ summary: z.string() }),
    });
    const logged = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
    expect(logged).not.toContain("SYSTEM PROMPT");
    expect(logged).not.toContain("Jane Doe");
    expect(logged).not.toContain("Acme Corp");
  });
});

describe("2. a failing provider is taken out of the chain", () => {
  it("opens the circuit immediately on an auth failure and stops calling it", async () => {
    stubFetch(() => fakeRes({ status: 401, body: "invalid api key" }));
    const chainLength = buildChain("fast").length;

    const first = await complete("a", "prompt-one", { tier: "fast" });
    expect(first.source).toBe("none");
    expect(calls).toHaveLength(chainLength);
    expect(circuitState().filter((c) => c.open)).toHaveLength(chainLength);

    // Same providers, new prompt: every key is open, so nothing is called.
    await complete("b", "prompt-two", { tier: "fast" });
    expect(calls).toHaveLength(chainLength);
  });

  it("opens the circuit only after the configured number of transient failures", async () => {
    config.llm.circuitThreshold = 2;
    stubFetch(() => fakeRes({ status: 503, body: "upstream busy" }));
    const chainLength = buildChain("fast").length;

    await complete("a", "one", { tier: "fast" });
    expect(calls).toHaveLength(chainLength);
    expect(circuitState().some((c) => c.open)).toBe(false);

    await complete("b", "two", { tier: "fast" });
    expect(calls).toHaveLength(chainLength * 2);
    expect(circuitState().filter((c) => c.open)).toHaveLength(chainLength);

    await complete("c", "three", { tier: "fast" });
    expect(calls).toHaveLength(chainLength * 2);
  });

  it("fails over to the next provider instead of giving up", async () => {
    stubFetch((url) =>
      url.startsWith("https://api.groq.com")
        ? fakeRes({ status: 500, body: "groq exploded" })
        : fakeRes({ body: chat("from openrouter") })
    );
    const res = await complete("sys", "prompt", { tier: "fast" });
    expect(res.provider).toBe("openrouter");
    expect(res.text).toBe("from openrouter");
  });
});

describe("3. startup self-test reports measured results", () => {
  it("reports PASS/FAIL per provider and a mode string that matches reality", async () => {
    stubFetch(
      routeByProvider({
        openrouter: fakeRes({ status: 401, body: "no credit" }),
        openrouterList: fakeRes({ status: 401, body: "no credit" }),
      })
    );

    const result = await runSelfTest({ print: false });
    const byProvider = Object.fromEntries(result.rows.map((r) => [r.provider, r]));

    expect(byProvider.groq.ok).toBe(true);
    expect(byProvider.openrouter.ok).toBe(false);
    expect(byProvider.openrouter.status).toBe(401);
    expect(byProvider.gemini.ok).toBe(true);
    expect(result.mode).toBe("groq:OK openrouter:FAIL(401) gemini:OK");
    expect(health().mode).toBe("llm+local");
    expect(health().selfTest.mode).toBe(result.mode);
  });

  it("reports local-only when nothing answers, and health() agrees", async () => {
    stubFetch(() => fakeRes({ status: 401, body: "bad key" }));
    const result = await runSelfTest({ print: false });

    expect(result.rows.every((r) => r.ok === false)).toBe(true);
    expect(result.mode).toBe("groq:FAIL(401) openrouter:FAIL(401) gemini:FAIL(401)");
    expect(health().mode).toBe("local-only");
  });

  it("probes providers without spending the request budget", async () => {
    config.llm.budgetPerMin = 0; // every user-facing call would be refused
    stubFetch(routeByProvider());
    const result = await runSelfTest({ print: false });
    expect(result.rows.every((r) => r.ok)).toBe(true);
  });

  it("marks a provider with no key as skipped, not failed", async () => {
    config.providers.gemini.apiKey = null;
    stubFetch(routeByProvider());
    const result = await runSelfTest({ print: false });
    const gemini = result.rows.find((r) => r.provider === "gemini");
    expect(gemini.ok).toBeNull();
    expect(gemini.reason).toMatch(/no API key/i);
  });
});

describe("4. model ids are verified against the live model list", () => {
  it("drops ids the provider no longer serves and never calls them", async () => {
    stubFetch(
      routeByProvider({
        groqList: fakeRes({ body: { data: [{ id: GROQ_FAST }] } }), // GROQ_LARGE retired
      })
    );

    const rows = await verifyModelLists();
    const retired = rows.find((r) => r.model === GROQ_LARGE);
    expect(retired).toMatchObject({ provider: "groq", listed: "no", action: "dropped from chain" });
    expect(isModelDead("groq", GROQ_LARGE)).toBe(true);
    expect(buildChain("fast").some((a) => a.model === GROQ_LARGE)).toBe(false);
    expect(deadModelList()).toContain(`groq:${GROQ_LARGE}`);

    stubFetch(() => fakeRes({ body: chat("OK") }));
    await complete("s", "p", { tier: "fast" });
    expect(calls.every((c) => c.body?.model !== GROQ_LARGE)).toBe(true);
  });

  it("keeps models when the model list itself is unreachable", async () => {
    stubFetch((url) =>
      url.includes("/models") ? fakeRes({ status: 503, body: "list unavailable" }) : fakeRes({ body: chat("OK") })
    );
    const rows = await verifyModelLists();
    expect(rows.every((r) => r.listed === "unknown")).toBe(true);
    expect(buildChain("fast")).toHaveLength(4);
  });

  it("does not retire every model when a list comes back empty", async () => {
    stubFetch((url) =>
      url.includes("/models") ? fakeRes({ body: { data: [] } }) : fakeRes({ body: chat("OK") })
    );
    const rows = await verifyModelLists();
    expect(rows.every((r) => r.listed === "unknown")).toBe(true);
    expect(rows[0].action).toMatch(/empty|unavailable/);
    expect(buildChain("fast")).toHaveLength(4);
    expect(deadModelList()).toEqual([]);
  });

  it("learns per-model JSON-mode support from the provider's own list", async () => {
    stubFetch(
      routeByProvider({
        openrouterList: fakeRes({
          body: { data: [{ id: OR_MODEL, supported_parameters: ["max_tokens"] }] },
        }),
      })
    );
    await verifyModelLists();
    expect(jsonSupports("openrouter", OR_MODEL)).toBe(false);
  });
});

describe("5. JSON mode is provider-specific; malformed replies are repaired locally", () => {
  it("asks for native JSON mode where the provider supports it", async () => {
    stubFetch(() => fakeRes({ body: chat('{"summary":"ok"}') }));
    await completeJson("s", "p", z.object({ summary: z.string() }), null, { tier: "fast", maxCalls: 1 });
    expect(calls[0].url).toContain("api.groq.com");
    expect(calls[0].body.response_format).toEqual({ type: "json_object" });
  });

  it("uses Gemini's own JSON switch", async () => {
    config.providers.groq.apiKey = null;
    config.providers.openrouter.apiKey = null;
    stubFetch(() => fakeRes({ body: geminiReply('{"summary":"ok"}') }));
    await completeJson("s", "p", z.object({ summary: z.string() }), null, { tier: "fast", maxCalls: 1 });
    expect(calls[0].url).toContain(":generateContent");
    expect(calls[0].body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("falls back to text extraction plus repair when JSON mode is unavailable", async () => {
    config.providers.groq.apiKey = null;
    config.providers.gemini.apiKey = null;
    setJsonSupport("openrouter", OR_MODEL, false);
    stubFetch(() =>
      fakeRes({ body: chat('Sure! Here you go:\n```json\n{"summary":"ok","skills":[]}\n```\nLet me know.') })
    );

    const res = await completeJson(
      "s",
      "p",
      z.object({ summary: z.string(), skills: z.array(z.string()) }),
      null,
      { tier: "fast", maxCalls: 1 }
    );
    expect(calls[0].body.response_format).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(res.source).toBe("llm");
    expect(res.data).toEqual({ summary: "ok", skills: [] });
  });

  it("repairs fences, prose and trailing commas without another call", () => {
    expect(repairJson('```json\n{"a":1,}\n```').value).toEqual({ a: 1 });
    expect(repairJson('Here: {"a":1} thanks').value).toEqual({ a: 1 });
    expect(repairJson("not json at all").ok).toBe(false);
  });

  it("never spends a second provider call repairing a bad reply", async () => {
    config.providers.openrouter.apiKey = null;
    config.providers.gemini.apiKey = null;
    stubFetch(() => fakeRes({ body: chat("I am afraid I cannot produce JSON.") }));
    const local = { summary: "local summary" };

    const res = await completeJson("s", "p", z.object({ summary: z.string() }), () => local, {
      tier: "fast",
      maxCalls: 1,
    });
    expect(calls).toHaveLength(1); // the old implementation issued a repair call here
    expect(res.source).toBe("local");
    expect(res.data).toEqual(local);
  });
});

describe("6. fastParse gates the LLM call", () => {
  it("ON: local parsing only, zero provider calls, under 2 seconds", async () => {
    stubFetch(() => fakeRes({ body: chat("must not be called") }));
    const started = Date.now();
    const parsed = await parseResume(RESUME, { fastParse: true });
    const elapsed = Date.now() - started;

    expect(calls).toHaveLength(0);
    expect(parsed.mode).toBe("fast");
    expect(parsed.summary).toContain("backend engineer");
    expect(parsed.skills).toContain("Node.js");
    expect(elapsed).toBeLessThan(2000);
  });

  it("OFF: exactly one enrichment call", async () => {
    stubFetch(() =>
      fakeRes({ body: chat(JSON.stringify({ summary: "Backend engineer.", skills: ["Node.js", "Kubernetes"] })) })
    );
    const parsed = await parseResume(RESUME, { fastParse: false, useLLM: true });

    expect(calls).toHaveLength(1);
    expect(parsed.mode).toBe("local+llm");
    expect(parsed.llm.source).toBe("llm");
    expect(parsed.summary).toBe("Backend engineer.");
  });

  it("OFF still returns the local resume when the provider is down", async () => {
    stubFetch(() => fakeRes({ status: 401, body: "bad key" }));
    const parsed = await parseResume(RESUME, { fastParse: false, useLLM: true });
    expect(calls).toHaveLength(1);
    expect(parsed.mode).toBe("local-only");
    expect(parsed.skills).toContain("Node.js");
  });
});

describe("7. profile extraction follows the same rules", () => {
  it("ON: no provider call at all", async () => {
    stubFetch(() => fakeRes({ body: chat("must not be called") }));
    const { profile, meta } = await extractProfileFromResume(RESUME, { fastParse: true });
    expect(calls).toHaveLength(0);
    expect(meta).toMatchObject({ mode: "local", llmCalls: 0 });
    expect(profile.fullName).toBe("Jane Doe");
    expect(profile.skills).toContain("Node.js");
  });

  it("OFF: one call, and invented skills are dropped", async () => {
    const payload = JSON.stringify({
      summary: "Staff backend engineer.",
      skills: ["Node.js", "Kubernetes", "Rust"],
      yearsOfExperience: 9,
    });
    // tier "large" starts with the strongest provider, so answer in its dialect.
    stubFetch(routeByProvider({ gemini: fakeRes({ body: geminiReply(payload) }) }));
    const { profile, meta } = await extractProfileFromResume(RESUME, { fastParse: false });

    expect(calls).toHaveLength(1);
    expect(meta).toMatchObject({ mode: "local+llm", llmCalls: 1, source: "llm" });
    expect(profile.summary).toBe("Staff backend engineer.");
    expect(profile.yearsOfExperience).toBe(9);
    expect(profile.skills).toContain("Node.js");
    expect(profile.skills).not.toContain("Rust"); // not present in the resume
  });

  it("OFF with a dead provider: one call, then the local profile", async () => {
    config.providers.openrouter.apiKey = null;
    config.providers.gemini.apiKey = null;
    stubFetch(() => fakeRes({ status: 401, body: "bad key" }));
    const { profile, meta } = await extractProfileFromResume(RESUME, { fastParse: false });

    expect(calls).toHaveLength(1);
    expect(meta).toMatchObject({ source: "local", llmCalls: 0 });
    expect(profile.fullName).toBe("Jane Doe");
    expect(profile.email).toBe("jane.doe@example.com");
  });

  it("generateProfessionalSummary is local and instant", () => {
    stubFetch(() => fakeRes({ body: chat("must not be called") }));
    const built = generateProfessionalSummary({
      fullName: "Jane Doe",
      yearsOfExperience: 9,
      skills: ["Node.js", "Redis"],
      location: "San Francisco",
    });
    expect(calls).toHaveLength(0);
    expect(built).toContain("Jane Doe");
    expect(built).toContain("9 years");
    expect(generateProfessionalSummary({ summary: "Existing" })).toBe("Existing");
  });
});

describe("8. health reflects what happened, not just what was configured", () => {
  it("exposes circuit state, retired models and the measured mode", async () => {
    stubFetch((url) =>
      url.startsWith("https://api.groq.com")
        ? fakeRes({ status: 401, body: "bad key" })
        : fakeRes({ body: chat("OK") })
    );
    await complete("s", "p", { tier: "fast" });
    markModelDead("groq", GROQ_LARGE, "retired by test");

    const h = health();
    expect(h.circuit.some((c) => c.open)).toBe(true);
    expect(h.deadModels).toContain(`groq:${GROQ_LARGE}`);
    expect(h.configured.groq).toBe(true);
    expect(h.selfTest).toBeNull(); // honest: no self-test has run in this process
  });
});




