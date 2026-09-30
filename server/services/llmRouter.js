import crypto from "node:crypto";
import config from "../config/index.js";
import logger from "../utils/logger.js";

/**
 * LLM Router — the ONLY place in HirePilot that talks to a model provider.
 *
 * Chain: Groq -> OpenRouter (free models) -> Gemini -> local non-LLM fallback.
 * Failover triggers: 429, 5xx, timeout, network error, auth error, unknown
 * model, empty output, invalid JSON, schema mismatch.
 *
 * Invariants enforced here:
 *  1. Every provider attempt is logged structurally (provider, model, status,
 *     error type, latency, redacted error). API keys and prompt/resume text
 *     are never logged — provider messages pass through `scrubError` first.
 *  2. `health().mode` reflects the *measured* state from the startup self-test,
 *     not merely the presence of an API key.
 *  3. Model ids are checked against each provider's live model list at boot;
 *     ids the provider no longer serves leave the chain instead of being
 *     retried on every request.
 *  4. JSON mode (`response_format` / `responseMimeType`) is requested only from
 *     providers/models that support it. Elsewhere the reply is treated as text
 *     and repaired locally. A malformed reply NEVER triggers a second LLM call,
 *     because that would silently double the cost of one extraction.
 *  5. A provider that keeps failing is skipped for a cooldown window (circuit
 *     breaker). 401/403 and unknown-model failures open it immediately.
 */

const states = new Map(); // key -> { failures, openUntil }
const buckets = new Map(); // key -> { tokens, lastRefill }
const cache = new Map(); // hash -> { at, value }
const callTimes = []; // global per-minute budget (fair, FIFO by arrival)
const stats = new Map(); // key -> { calls, failures, totalMs, tokens }
const jsonCapable = new Map(); // chain key -> boolean (supports JSON mode)
const deadModels = new Set(); // "provider:model" ids the provider no longer serves

let selfTestResult = null; // { ranAt, mode, rows } — written by the self-test

const now = () => Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------- secrets
/** Nothing that reaches a log line may carry a credential or a resume. */
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_\-]{6,}/g,
  /gsk_[A-Za-z0-9_\-]{6,}/g,
  /AIza[0-9A-Za-z_\-]{6,}/g,
  /or-[A-Za-z0-9_\-]{6,}/g,
  /key=[A-Za-z0-9_\-]{6,}/gi,
  /Bearer\s+[A-Za-z0-9._\-]{6,}/gi,
];

/** Truncate and strip credentials/PII from anything a provider echoes back. */
export const scrubError = (value, max = 180) => {
  let out = String(value ?? "");
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[redacted]");
  out = out.replace(/mongodb(?:\+srv)?:\/\/\S+/gi, "[db-uri]");
  out = out.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]");
  return out.replace(/\s+/g, " ").trim().slice(0, max);
};

/** Stable, low-cardinality error label for logs and metrics. */
export const classifyError = (err) => {
  if (!err) return "unknown";
  if (err.name === "AbortError" || /aborted|timeout|timed out/i.test(err.message || "")) return "timeout";
  const st = Number(err.status) || 0;
  if (st === 401 || st === 403) return "auth";
  if (st === 404) return "model_not_found";
  if (st === 429) return "rate_limit";
  if (st >= 500) return "server_error";
  if (st >= 400) return "bad_request";
  if (["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "EAI_AGAIN", "ETIMEDOUT"].includes(err.code)) return "network";
  const msg = String(err.message || "");
  if (["empty_output", "invalid_json", "schema_mismatch", "circuit_open", "rate_limited_local"].includes(msg)) return msg;
  return "error";
};

/** Auth and unknown-model failures can never be fixed by retrying. */
const isFatal = (type) => type === "auth" || type === "model_not_found";

// -------------------------------------------------------------- circuit breaker
const circuitCfg = () => ({
  threshold: config.llm.circuitThreshold,
  resetMs: config.llm.circuitCooldownMs,
});

const stateFor = (key) => {
  if (!states.has(key)) states.set(key, { failures: 0, openUntil: 0 });
  return states.get(key);
};

const circuitOpen = (key) => stateFor(key).openUntil > now();

/**
 * Count a failure. `fatal` (401/403, unknown model) opens the circuit at once:
 * hammering a dead key on every upload is what previously turned one broken
 * provider into "llm chain exhausted" for the whole chain.
 */
const recordFailure = (key, { fatal = false } = {}) => {
  const s = stateFor(key);
  const { threshold, resetMs } = circuitCfg();
  s.failures += 1;
  if (fatal || s.failures >= threshold) {
    s.openUntil = now() + resetMs;
    s.failures = 0;
  }
};

const recordSuccess = (key) => {
  const s = stateFor(key);
  s.failures = 0;
  s.openUntil = 0;
};

/** Circuit snapshot for health()/tests: which keys are currently skipped. */
export const circuitState = () =>
  [...states.entries()].map(([key, s]) => ({
    key,
    failures: s.failures,
    open: s.openUntil > now(),
    openForMs: Math.max(0, s.openUntil - now()),
  }));

/** Per-provider token bucket (refills continuously). */
const takeToken = (key, ratePerMin, burst = 8) => {
  const t = now();
  const b = buckets.get(key) || { tokens: burst, lastRefill: t };
  const refill = ((t - b.lastRefill) / 60_000) * ratePerMin;
  b.tokens = Math.min(burst, b.tokens + refill);
  b.lastRefill = t;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
};

/** Global per-minute budget, shared fairly across all users. */
const takeGlobalSlot = () => {
  const cutoff = now() - 60_000;
  while (callTimes.length && callTimes[0] < cutoff) callTimes.shift();
  if (callTimes.length >= config.llm.budgetPerMin) return false;
  callTimes.push(now());
  return true;
};

const bumpStat = (key, patch) => {
  const s = stats.get(key) || { calls: 0, failures: 0, totalMs: 0, tokens: 0 };
  Object.assign(s, patch);
  stats.set(key, s);
  return s;
};

// ------------------------------------------------------------------ http layer
class HttpError extends Error {
  constructor(status, body, retryAfter) {
    super(`HTTP ${status}`);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
    this.retryAfter = retryAfter;
  }
}

const requestJson = async (method, url, body, headers, timeoutMs) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || config.llm.timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: ctl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      // Provider bodies never contain our credentials, but scrub anyway.
      throw new HttpError(res.status, scrubError(text, 300), Number(res.headers.get("retry-after")) || undefined);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
};

// ----------------------------------------------------------- provider catalogue
/**
 * One definition per provider, shared by the request builder, the model-list
 * verification and the startup self-test so all three speak the same dialect.
 *  - `listIds`    maps a model-list response to the ids that provider serves
 *  - `jsonSupport` maps a model entry to true/false/null (null = unknown)
 *  - `defaultJson` is the assumption used until the model list says otherwise
 */
const PROVIDERS = {
  groq: {
    listUrl: () => "https://api.groq.com/openai/v1/models",
    listHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
    listIds: (data) => (data?.data || []).map((m) => m.id).filter(Boolean),
    jsonSupport: null,
    defaultJson: true,
    chatUrl: () => "https://api.groq.com/openai/v1/chat/completions",
    chatHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  openrouter: {
    listUrl: () => "https://openrouter.ai/api/v1/models",
    listHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
    listIds: (data) => (data?.data || []).map((m) => m.id).filter(Boolean),
    // OpenRouter advertises JSON mode per model in `supported_parameters`.
    jsonSupport: (entry) =>
      Array.isArray(entry?.supported_parameters)
        ? entry.supported_parameters.includes("response_format")
        : null,
    defaultJson: false,
    chatUrl: () => "https://openrouter.ai/api/v1/chat/completions",
    chatHeaders: (key) => ({
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://hirepilot.app",
      "X-Title": "HirePilot",
    }),
  },
  gemini: {
    listUrl: () => "https://generativelanguage.googleapis.com/v1beta/models",
    listHeaders: (key) => ({ "x-goog-api-key": key }),
    listIds: (data) =>
      (data?.models || [])
        .map((m) => String(m.name || "").replace(/^models\//, ""))
        .filter(Boolean),
    jsonSupport: null,
    defaultJson: true,
    chatUrl: (model) =>
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    chatHeaders: (key) => ({ "x-goog-api-key": key }),
  },
};

export const providerNames = Object.keys(PROVIDERS);

const chainKey = (provider, model) => `${provider}:${model}`;

/** apiKey plus the model ids this deployment asked for, per provider. */
export const providerConfig = (name) => {
  const p = config.providers[name] || {};
  if (name === "groq") {
    const models = [p.fastModel, p.largeModel].filter(Boolean);
    return { apiKey: p.apiKey || null, models };
  }
  if (name === "openrouter") return { apiKey: p.apiKey || null, models: p.models || [] };
  if (name === "gemini") {
    const models = [p.model].filter(Boolean);
    return { apiKey: p.apiKey || null, models };
  }
  return { apiKey: null, models: [] };
};

export const isModelDead = (provider, model) => deadModels.has(chainKey(provider, model));

/** Take a model out of the chain (and say why, without dumping the raw error). */
export const markModelDead = (provider, model, reason) => {
  if (isModelDead(provider, model)) return;
  deadModels.add(chainKey(provider, model));
  logger.warn("llm model unavailable", { provider, model, reason: scrubError(reason) });
};

export const deadModelList = () => [...deadModels];

/** Does this provider/model get a native JSON-mode request? */
export const jsonSupports = (provider, model) =>
  jsonCapable.has(chainKey(provider, model))
    ? jsonCapable.get(chainKey(provider, model))
    : Boolean(PROVIDERS[provider]?.defaultJson);

export const setJsonSupport = (provider, model, ok) => {
  jsonCapable.set(chainKey(provider, model), Boolean(ok));
};

/** Providers that are configured *and* still have a live model id. */
export const liveChain = () => buildChain("large").map((a) => ({ provider: a.provider, model: a.model }));

const RATE_PER_MIN = { groq: 20, openrouter: 10, gemini: 15 };

// --------------------------------------------------------------- request builder
/** Build the native request for one (provider, model) pair. */
const buildRequest = (attempt, messages, { temperature, maxTokens, json, noThinking }) => {
  const def = PROVIDERS[attempt.provider];
  const key = providerConfig(attempt.provider).apiKey;
  if (attempt.provider === "gemini") {
    // Gemini wants system text in its own field and "model" as the assistant role.
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const rest = messages.filter((m) => m.role !== "system");
    return {
      url: def.chatUrl(attempt.model),
      headers: def.chatHeaders(key),
      body: {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: rest.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens || 2048,
          // Native JSON mode: Gemini's equivalent of response_format.
          ...(json ? { responseMimeType: "application/json" } : {}),
          // Reasoning models bill thinking tokens against this budget; a zero
          // budget keeps a one-word "OK" answer from being all thinking.
          ...(noThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      },
      // Prefer the answer parts; fall back to whatever the model produced.
      text: (data) => {
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const answered = parts.filter((p) => !p.thought);
        const source = answered.length ? answered : parts;
        return source.map((p) => p.text || "").join("");
      },
      tokens: (data) => data?.usageMetadata?.totalTokenCount || 0,
    };
  }
  // Groq and OpenRouter are OpenAI-compatible.
  return {
    url: def.chatUrl(attempt.model),
    headers: def.chatHeaders(key),
    body: {
      model: attempt.model,
      messages,
      temperature,
      max_tokens: maxTokens || 2048,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    },
    text: (data) => {
      const message = data?.choices?.[0]?.message;
      // Reasoning models (gpt-oss, deepseek-r1) can return the answer in a
      // separate channel; a bare "did you answer?" probe must not read as empty.
      return message?.content || message?.reasoning || "";
    },
    tokens: (data) => data?.usage?.total_tokens || 0,
  };
};

/** Exactly one HTTP request to one provider. Throws on non-2xx/timeout. */
const callProvider = async (attempt, messages, opts) => {
  const req = buildRequest(attempt, messages, opts);
  const data = await requestJson("POST", req.url, req.body, req.headers, opts.timeoutMs);
  return { text: req.text(data), tokens: req.tokens(data) };
};

// ------------------------------------------------------------ model verification
/**
 * Validate every configured model id against the provider's live model list.
 * Ids the provider no longer serves are dropped from the chain instead of being
 * retried on every request, and OpenRouter's per-model JSON-mode support is
 * learned from the same response. Never throws: an unreachable provider is
 * reported as such and its models are kept (a list outage is not their fault).
 */
export const verifyModelLists = async (timeoutMs = 8000) => {
  const rows = [];
  await Promise.all(
    providerNames.map(async (provider) => {
      const def = PROVIDERS[provider];
      const { apiKey, models } = providerConfig(provider);
      if (!apiKey || !models.length) return;
      let ids = null;
      let status = 0;
      let error = null;
      let emptyList = false;
      try {
        const data = await requestJson("GET", def.listUrl(), null, def.listHeaders(apiKey), timeoutMs);
        const parsed = def.listIds(data);
        // An empty list is not proof that every configured model was retired —
        // it is usually a truncated or unexpected payload. Keep the models.
        ids = parsed.length ? parsed : null;
        emptyList = Boolean(data) && parsed.length === 0;
        if (def.jsonSupport) {
          for (const entry of data?.data || []) {
            const id = String(entry?.id || "");
            const supported = def.jsonSupport(entry);
            if (id && models.includes(id) && supported != null) setJsonSupport(provider, id, supported);
          }
        }
      } catch (err) {
        status = Number(err?.status) || 0;
        error = classifyError(err);
      }
      for (const model of models) {
        if (!ids) {
          rows.push({
            provider,
            model,
            listed: "unknown",
            status,
            error,
            action: emptyList ? "kept (model list came back empty)" : "kept (model list unavailable)",
          });
          continue;
        }
        const present = ids.includes(model);
        if (!present) markModelDead(provider, model, "not in provider model list");
        rows.push({
          provider,
          model,
          listed: present ? "yes" : "no",
          status,
          error,
          action: present ? "kept" : "dropped from chain",
        });
      }
    })
  );
  return rows;
};

/** Build the ordered attempt list: model -> next model -> next provider. */
export const buildChain = (tier) => {
  const chain = [];
  for (const provider of providerNames) {
    const { apiKey, models } = providerConfig(provider);
    if (!apiKey) continue;
    for (const model of models) {
      if (isModelDead(provider, model)) continue;
      chain.push({ key: chainKey(provider, model), provider, model, rate: RATE_PER_MIN[provider] || 10 });
    }
  }
  // Cheap-first for parsing/scoring, quality-first for writing.
  return tier === "fast" ? chain : [...chain].reverse();
};

const cacheKey = (messages, tier, opts) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify({ messages, tier, temp: opts?.temperature, max: opts?.maxTokens, json: opts?.json }))
    .digest("hex");

const readCache = (key) => {
  const hit = cache.get(key);
  if (!hit) return null;
  if (now() - hit.at > config.llm.cacheTtlMs) {
    cache.delete(key);
    return null;
  }
  return hit.value;
};

const sleepBackoff = (attempt, retryAfterSec) => {
  const base = retryAfterSec ? retryAfterSec * 1000 : 400 * 2 ** attempt;
  const jitter = Math.random() * 250;
  return Math.min(base + jitter, 8000);
};

// ------------------------------------------------------------- JSON extraction
/**
 * Parse a model reply as JSON *locally*: strip code fences, slice down to the
 * outer braces, drop trailing commas. There is deliberately no "ask the model
 * to fix its JSON" round-trip here — a repair call costs as much as the original
 * one and would break the "one enrichment call per extraction" guarantee.
 */
export const repairJson = (raw) => {
  const source = String(raw ?? "");
  const unboxed = source
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  const start = unboxed.indexOf("{");
  const end = unboxed.lastIndexOf("}");
  const candidates = [unboxed];
  if (start !== -1 && end > start) candidates.push(unboxed.slice(start, end + 1));
  for (const candidate of candidates) {
    for (const shape of [candidate, candidate.replace(/,\s*([}\]])/g, "$1")]) {
      try {
        const value = JSON.parse(shape);
        if (value && typeof value === "object") return { ok: true, value };
      } catch {
        /* try the next candidate shape */
      }
    }
  }
  return { ok: false };
};

/** Strict parse first, local repair second. Never calls a model. */
const safeJson = (raw) => {
  if (raw && typeof raw === "object") return { ok: true, value: raw };
  try {
    const value = JSON.parse(String(raw));
    if (value && typeof value === "object") return { ok: true, value };
  } catch {
    /* fall through to the repair path */
  }
  return repairJson(raw);
};

/**
 * Structured per-attempt log line. Metadata only: provider, model, HTTP status,
 * error type, latency and a scrubbed error string. Prompts, resume text and
 * credentials never reach this function.
 */
const logAttempt = ({ attempt, ok, status, errorType, latencyMs, tokens, err, attemptNo }) => {
  logger[ok ? "info" : "warn"]("llm attempt", {
    provider: attempt.provider,
    model: attempt.model,
    status: status ?? null,
    errorType: errorType ?? null,
    latencyMs,
    attemptNo,
    // "usage", not "tokens": the shared logger redacts any key matching
    // /token/i, which would hide a harmless completion count.
    ...(tokens ? { usage: { total: tokens } } : {}),
    ...(err ? { err: scrubError(err) } : {}),
  });
};

/** Skips that never reached the network are still worth reporting. */
const logSkip = (attempt, errorType) =>
  logger.warn("llm attempt skipped", {
    provider: attempt.provider,
    model: attempt.model,
    status: null,
    errorType,
    latencyMs: 0,
  });

/**
 * Run a completion through the provider chain.
 * @param {object} opts { tier, temperature, maxTokens, validate: zodSchema,
 *                        fallback: fn, userId, json, maxCalls }
 * @returns {Promise<{text, provider, model, cached, source, attempts, errors}>}
 */
export const complete = async (system, prompt, opts = {}) => {
  const {
    tier = "large",
    temperature = 0.3,
    maxTokens,
    validate,
    fallback,
    userId,
    // JSON mode is requested automatically whenever a schema is enforced.
    json = Boolean(validate),
    // Hard cap on upstream HTTP calls for this one logical call. The resume
    // enrichment path passes maxCalls: 1 so one extraction can never cost two
    // provider calls.
    maxCalls = Number.POSITIVE_INFINITY,
  } = opts;
  const messages = [
    ...(system ? [{ role: "system", content: system }] : []),
    { role: "user", content: prompt },
  ];
  const key = cacheKey(messages, tier, { temperature, maxTokens, json });

  const cached = readCache(key);
  if (cached) return { ...cached, cached: true };

  const chain = buildChain(tier);
  const errors = [];
  let upstreamCalls = 0;

  for (const attempt of chain) {
    if (circuitOpen(attempt.key)) {
      logSkip(attempt, "circuit_open");
      errors.push({ provider: attempt.provider, model: attempt.model, errorType: "circuit_open" });
      continue;
    }
    if (!takeToken(attempt.key, attempt.rate)) {
      logSkip(attempt, "rate_limited_local");
      errors.push({ provider: attempt.provider, model: attempt.model, errorType: "rate_limited_local" });
      continue;
    }
    if (!takeGlobalSlot()) {
      // Budget exhausted: stop early and use the deterministic fallback rather
      // than letting the whole pipeline stall.
      logSkip(attempt, "budget_exhausted");
      break;
    }
    if (upstreamCalls >= maxCalls) {
      logSkip(attempt, "call_cap_reached");
      break;
    }

    for (let tries = 0; tries <= config.llm.maxRetriesPerProvider; tries++) {
      if (upstreamCalls >= maxCalls) break;
      const started = Date.now();
      const wantJson = json && jsonSupports(attempt.provider, attempt.model);
      let latencyMs = 0;
      try {
        upstreamCalls += 1;
        const { text, tokens } = await callProvider(attempt, messages, {
          temperature,
          maxTokens,
          json: wantJson,
        });
        latencyMs = Date.now() - started;
        if (!text || !text.trim()) {
          const empty = new Error("empty_output");
          empty.latencyMs = latencyMs;
          throw empty;
        }

        let value = text.trim();
        if (validate) {
          const parsed = safeJson(value);
          if (!parsed.ok) throw new Error("invalid_json");
          const check = validate.safeParse(parsed.value);
          if (!check.success) throw new Error("schema_mismatch");
          value = check.data;
        }

        recordSuccess(attempt.key);
        const prev = stats.get(attempt.key) || { calls: 0, failures: 0, totalMs: 0, tokens: 0 };
        bumpStat(attempt.key, {
          calls: prev.calls + 1,
          totalMs: prev.totalMs + latencyMs,
          tokens: prev.tokens + tokens,
        });
        logAttempt({ attempt, ok: true, status: 200, latencyMs, tokens, attemptNo: tries + 1 });
        cache.set(key, { at: now(), value });
        // Metadata only — never prompts, keys or resume text.
        logger.info("llm call", {
          provider: attempt.provider,
          model: attempt.model,
          latencyMs,
          usage: { total: tokens },
          userId,
        });
        return {
          text: value,
          provider: attempt.provider,
          model: attempt.key,
          cached: false,
          source: "llm",
          attempts: errors.length + 1,
        };
      } catch (err) {
        latencyMs = err?.latencyMs ?? Date.now() - started;
        const errorType = classifyError(err);
        const status = Number(err?.status) || null;
        logAttempt({
          attempt,
          ok: false,
          status,
          errorType,
          latencyMs,
          err: err?.body || err?.message,
          attemptNo: tries + 1,
        });
        const prev = stats.get(attempt.key) || { calls: 0, failures: 0, totalMs: 0, tokens: 0 };
        bumpStat(attempt.key, { failures: prev.failures + 1 });
        errors.push({ provider: attempt.provider, model: attempt.model, status, errorType });
        // Auth/unknown-model failures always count towards opening the circuit.
        recordFailure(attempt.key, { fatal: isFatal(errorType) });
        if (isFatal(errorType)) break;
        if (tries < config.llm.maxRetriesPerProvider && upstreamCalls < maxCalls) {
          await sleep(sleepBackoff(tries, err?.retryAfter));
        }
      }
    }
  }

  logger.warn("llm chain exhausted, using local fallback", {
    upstreamCalls,
    attempts: errors.length,
    reasons: errors.slice(0, 8),
  });
  if (fallback) {
    const value = await fallback();
    cache.set(key, { at: now(), value });
    return { text: value, provider: "local", model: "deterministic", cached: false, source: "local", errors };
  }
  return { text: "", provider: "none", model: "none", cached: false, source: "none", errors };
};

/**
 * One real, minimal call against a single model — the startup self-test probe.
 * It uses the same request builder as production traffic (so the result means
 * something) but bypasses the token bucket, the global budget and the circuit
 * breaker: a health check must never be blocked by the thing it is checking.
 */
export const probeModel = async (provider, model, { timeoutMs = 12000 } = {}) => {
  const attempt = { key: chainKey(provider, model), provider, model, rate: 0 };
  const started = Date.now();
  const messages = [
    { role: "system", content: "Reply with the single word OK." },
    { role: "user", content: "ping" },
  ];
  try {
    const { text, tokens } = await callProvider(attempt, messages, {
      temperature: 0,
      // Enough room for a one-word answer even when the model thinks first.
      maxTokens: 96,
      json: false,
      timeoutMs,
      noThinking: true,
    });
    const latencyMs = Date.now() - started;
    if (!text || !text.trim()) {
      logAttempt({ attempt, ok: false, status: null, errorType: "empty_output", latencyMs });
      return { ok: false, status: null, errorType: "empty_output", latencyMs, detail: "empty reply" };
    }
    logAttempt({ attempt, ok: true, status: 200, latencyMs, tokens, attemptNo: 1 });
    return { ok: true, status: 200, errorType: null, latencyMs, detail: "", tokens };
  } catch (err) {
    const errorType = classifyError(err);
    const status = Number(err?.status) || null;
    const latencyMs = Date.now() - started;
    logAttempt({
      attempt,
      ok: false,
      status,
      errorType,
      latencyMs,
      err: err?.body || err?.message,
      attemptNo: 1,
    });
    return { ok: false, status, errorType, latencyMs, detail: scrubError(err?.body || err?.message, 120) };
  }
};

/** JSON-mode helper: every caller gets a validated object or a local fallback. */
export const completeJson = async (system, prompt, schema, fallback, opts = {}) => {
  const res = await complete(system, prompt, { ...opts, validate: schema, fallback });
  if (res.source === "llm" && typeof res.text !== "string") return { ...res, data: res.text };
  const parsed = safeJson(res.text);
  return { ...res, data: parsed.ok ? parsed.value : null };
};

/** Result of the startup self-test, published for health()/llmMode. */
export const setSelfTest = (result) => {
  selfTestResult = result ? { ...result, ranAt: result.ranAt || new Date().toISOString() } : null;
};

export const getSelfTest = () => selfTestResult;

/** Reset all internal state (tests). */
export const _reset = () => {
  states.clear();
  buckets.clear();
  cache.clear();
  stats.clear();
  callTimes.length = 0;
  jsonCapable.clear();
  deadModels.clear();
  selfTestResult = null;
};

export const health = () => {
  const configured = {
    ...Object.fromEntries(providerNames.map((p) => [p, Boolean(providerConfig(p).apiKey)])),
    localFallback: true,
  };
  const anyProvider = providerNames.some((p) => configured[p]);
  const anyLive = selfTestResult ? selfTestResult.rows.some((r) => r.ok) : null;
  return {
    configured,
    anyProvider,
    // Honest mode: measured when we have measured it, configured otherwise.
    mode:
      anyLive === null ? (anyProvider ? "llm+local" : "local-only") : anyLive ? "llm+local" : "local-only",
    selfTest: selfTestResult
      ? { ranAt: selfTestResult.ranAt, mode: selfTestResult.mode, rows: selfTestResult.rows }
      : null,
    deadModels: deadModelList(),
    circuit: circuitState(),
    usage: [...stats.entries()].map(([key, s]) => ({ key, ...s })),
    budget: { usedThisMinute: callTimes.length, limitPerMinute: config.llm.budgetPerMin },
    cacheEntries: cache.size,
  };
};

export default {
  complete,
  completeJson,
  health,
  _reset,
  repairJson,
  setSelfTest,
  getSelfTest,
  verifyModelLists,
  buildChain,
  liveChain,
  circuitState,
  scrubError,
  classifyError,
  providerConfig,
  providerNames,
};






