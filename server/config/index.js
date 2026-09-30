import crypto from "node:crypto";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from project root (parent of server/) — never from source control.
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env"), quiet: true });
dotenv.config({ quiet: true }); // also honour a server/.env if present locally

// A blank line in .env (KEY=) means "not set" — never a validation failure.
const optStr = (schema = z.string()) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());

const bool = (def) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return def;
      if (typeof v === "boolean") return v;
      return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
    });

const int = (def) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : parseInt(v, 10)));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: int(6900),

  // --- Secrets: only ever read from the environment -----------------------
  JWT_SECRET: optStr(z.string().min(16)),
  ENCRYPTION_KEY: optStr(z.string().length(64, "ENCRYPTION_KEY must be 64 hex chars (32 bytes)")),
  MONGO_URI: optStr(z.string().min(1)),

  GROQ_API_KEY: optStr(),
  OPENROUTER_API_KEY: optStr(),
  GEMINI_API_KEY: optStr(),

  // Optional free-key job sources (feature-flagged, off unless key present)
  ADZUNA_CLIENT_ID: optStr(),
  ADZUNA_API_KEY: optStr(),
  JSEARCH_API_KEY: optStr(),

  // --- LLM router (model ids live in config, not in code paths) ----------
  GROQ_FAST_MODEL: z.string().default("llama-3.1-8b-instant"),
  GROQ_LARGE_MODEL: z.string().default("llama-3.3-70b-versatile"),
  OPENROUTER_MODELS: z
    .string()
    .default(
      "meta-llama/llama-3.3-70b-instruct:free,deepseek/deepseek-chat-v3-0324:free,google/gemini-2.0-flash-exp:free"
    ),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
  LLM_TIMEOUT_MS: int(45000),
  LLM_MAX_RETRIES_PER_PROVIDER: int(2),
  LLM_BUDGET_PER_MIN: int(30),
  LLM_CACHE_TTL_MS: int(600000),
  // Circuit breaker: after N consecutive failures a provider/model is skipped
  // for this cooldown window instead of being retried on every request.
  LLM_CIRCUIT_THRESHOLD: int(3),
  LLM_CIRCUIT_COOLDOWN_MS: int(30000),

  // --- Pipeline ----------------------------------------------------------
  APPLY_CONCURRENCY: int(4),
  DEFAULT_BATCH_SIZE: int(25),
  MAX_BATCH_SIZE: int(100),
  FIT_GATE_THRESHOLD: int(70),
  JOB_CACHE_TTL_MS: int(3600000),
  JOB_FRESHNESS_DAYS: int(7),

  // --- Feature flags -----------------------------------------------------
  FLAG_AUTO_SUBMIT: bool(false),
  FLAG_LLM_ENRICHMENT: bool(true),
  FLAG_WARM_CACHE_ON_BOOT: bool(false),
  FLAG_SOURCE_REMOTIVE: bool(true),
  FLAG_SOURCE_HIMALAYAS: bool(true),
  FLAG_SOURCE_JOBICY: bool(true),
  FLAG_SOURCE_REMOTEOK: bool(true),
  FLAG_SOURCE_ARBEITNOW: bool(true),
  FLAG_SOURCE_WWR: bool(true),
  FLAG_SOURCE_GREENHOUSE: bool(true),
  FLAG_SOURCE_LEVER: bool(true),
  FLAG_SOURCE_ASHBY: bool(true),
  FLAG_SOURCE_ADZUNA: bool(false),
  FLAG_SOURCE_USAJOB: bool(false),
  FLAG_SOURCE_JSEARCH: bool(false),

  SENTRY_DSN: optStr(),
  METRICS_TOKEN: optStr(),
  MONGO_MEMORY_EPHEMERAL: bool(false),
  CORS_ORIGINS: optStr(),
});


const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Report variable NAMES only — never values.
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const env = parsed.data;
const isProd = env.NODE_ENV === "production";
const isTest = env.NODE_ENV === "test";

// Fail fast on missing required secrets in production. In dev/test we mint
// ephemeral secrets so `npm run dev` and the test suite need no setup.
if (!env.JWT_SECRET) {
  if (isProd) throw new Error("JWT_SECRET is required in production");
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
}
if (!env.ENCRYPTION_KEY) {
  if (isProd) throw new Error("ENCRYPTION_KEY is required in production");
  process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
}
if (isProd && !env.MONGO_URI) {
  throw new Error("MONGO_URI is required in production (use the MongoDB Atlas free tier)");
}

const cfg = {
  env: env.NODE_ENV,
  isProd,
  isTest,
  port: env.PORT,

  jwtSecret: env.JWT_SECRET,
  encryptionKey: env.ENCRYPTION_KEY,
  mongoUri: env.MONGO_URI || null,
  mongoMemoryEphemeral: env.MONGO_MEMORY_EPHEMERAL,

  // An absent optional provider key means "skip that provider", never a crash.
  providers: {
    groq: {
      apiKey: env.GROQ_API_KEY || null,
      fastModel: env.GROQ_FAST_MODEL,
      largeModel: env.GROQ_LARGE_MODEL,
    },
    openrouter: {
      apiKey: env.OPENROUTER_API_KEY || null,
      models: env.OPENROUTER_MODELS.split(",")
        .map((m) => m.trim())
        .filter(Boolean),
    },
    gemini: { apiKey: env.GEMINI_API_KEY || null, model: env.GEMINI_MODEL },
  },

  llm: {
    timeoutMs: env.LLM_TIMEOUT_MS,
    maxRetriesPerProvider: env.LLM_MAX_RETRIES_PER_PROVIDER,
    budgetPerMin: env.LLM_BUDGET_PER_MIN,
    cacheTtlMs: env.LLM_CACHE_TTL_MS,
    circuitThreshold: env.LLM_CIRCUIT_THRESHOLD,
    circuitCooldownMs: env.LLM_CIRCUIT_COOLDOWN_MS,
  },

  pipeline: {
    concurrency: Math.min(Math.max(env.APPLY_CONCURRENCY, 1), 5),
    defaultBatchSize: env.DEFAULT_BATCH_SIZE,
    maxBatchSize: env.MAX_BATCH_SIZE,
    fitGateThreshold: env.FIT_GATE_THRESHOLD,
  },

  jobs: { cacheTtlMs: env.JOB_CACHE_TTL_MS, freshnessDays: env.JOB_FRESHNESS_DAYS },

  jobKeys: {
    adzuna: { id: env.ADZUNA_CLIENT_ID || null, key: env.ADZUNA_API_KEY || null },
    jsearch: env.JSEARCH_API_KEY || null,
  },

  flags: {
    autoSubmit: env.FLAG_AUTO_SUBMIT,
    llmEnrichment: env.FLAG_LLM_ENRICHMENT,
    // Background cache warm-up spends API quota; opt-in only.
    warmCacheOnBoot: env.FLAG_WARM_CACHE_ON_BOOT,
    sources: {
      remotive: env.FLAG_SOURCE_REMOTIVE,
      himalayas: env.FLAG_SOURCE_HIMALAYAS,
      jobicy: env.FLAG_SOURCE_JOBICY,
      remoteok: env.FLAG_SOURCE_REMOTEOK,
      arbeitnow: env.FLAG_SOURCE_ARBEITNOW,
      wwr: env.FLAG_SOURCE_WWR,
      greenhouse: env.FLAG_SOURCE_GREENHOUSE,
      lever: env.FLAG_SOURCE_LEVER,
      ashby: env.FLAG_SOURCE_ASHBY,
      adzuna: env.FLAG_SOURCE_ADZUNA && Boolean(env.ADZUNA_API_KEY),
      usajobs: env.FLAG_SOURCE_USAJOB,
      jsearch: env.FLAG_SOURCE_JSEARCH && Boolean(env.JSEARCH_API_KEY),
    },
  },

  sentryDsn: env.SENTRY_DSN || null,
  metricsToken: env.METRICS_TOKEN || null,

  corsOrigins: (
    env.CORS_ORIGINS ||
    "http://localhost:3000,https://hire-pilot-job.vercel.app"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

// Tests must never touch the public internet: sources are exercised through
// saved fixtures / mocked HTTP instead.
if (isTest) {
  for (const k of Object.keys(cfg.flags.sources)) cfg.flags.sources[k] = false;
}

export default cfg;
