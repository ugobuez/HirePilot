import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";

import config from "./config/index.js";
import { connectDB, disconnectDB } from "./config/db.js";
import logger, { newRequestId } from "./utils/logger.js";
import { health as llmHealth, scrubError } from "./services/llmRouter.js";
import { runSelfTest } from "./services/llmSelfTest.js";

import aiRoutes from "./routes/aiRoutes.js";
import jobRoutes from "./routes/jobRoutes.js";
import applicationRoutes from "./routes/applicationRoutes.js";
import resumeRoutes from "./routes/resumeRoutes.js";
import scrapeRoutes from "./routes/scrapeRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import automationRoutes from "./routes/automationRoutes.js";

/**
 * HirePilot API server.
 *
 * Boot order is deliberate and fail-fast:
 *   1. validate configuration (throws on unusable production config)
 *   2. connect to MongoDB (embedded in dev/test, Atlas in production)
 *   3. start listening
 * Background work is opt-in and never fires on a public boot.
 */

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

// --- Security headers ------------------------------------------------------
app.use(
  helmet({
    // The API returns JSON and files; no inline scripts are ever served.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'"],
        styleSrc: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-site" },
  })
);

// --- CORS -----------------------------------------------------------------
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "x-request-id"],
    optionsSuccessStatus: 200,
  })
);

// --- Request id + structured access log -----------------------------------
app.use((req, res, next) => {
  req.id = req.get("x-request-id") || newRequestId();
  res.setHeader("x-request-id", req.id);
  const started = Date.now();
  res.on("finish", () => {
    logger.info("http", {
      id: req.id,
      method: req.method,
      // Query strings can carry tokens, so only the path is logged.
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - started,
    });
  });
  next();
});

// --- Rate limits ----------------------------------------------------------
// Generous for normal use, strict for the expensive LLM/apply endpoints.
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 240,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down." },
});

const llmLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many AI requests — please wait a moment." },
});

app.use(generalLimiter);

// Bodies are text, not uploads (uploads go through multer with its own limits).
app.use(express.json({ limit: "1mb" }));

// --- Routes ---------------------------------------------------------------
app.use("/api/resume", resumeRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/v1/applications", applicationRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/automation", automationRoutes);
// LLM-backed endpoints get their own, tighter bucket.
app.use("/api", llmLimiter, aiRoutes);
app.use("/api", scrapeRoutes);

app.get("/", (req, res) => {
  res.json({ name: "HirePilot API", status: "running", health: "/api/health" });
});

/** Honest health: reports what is actually true, including degraded states. */
app.get("/api/health", (req, res) => {
  const dbState =
    ["disconnected", "connected", "connecting", "disconnecting"][mongoose.connection.readyState] ||
    "unknown";
  const llm = llmHealth();
  // Real measured mode once the self-test has run; key-presence otherwise.
  const anyProvider = llm.anyProvider;

  const degraded = dbState !== "connected";
  res.status(degraded ? 503 : 200).json({
    status: degraded ? "degraded" : "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    env: config.env,
    database: dbState,
    llm: {
      // "none configured" is a supported state: deterministic local modes still work.
      providers: llm.configured,
      anyProvider,
      // Measured by the startup self-test; key-presence only before that.
      mode: llm.mode,
      selfTest: llm.selfTest,
      deadModels: llm.deadModels,
      circuit: llm.circuit,
      budget: llm.budget,
      cacheEntries: llm.cacheEntries,
    },
    features: {
      autoSubmit: config.flags.autoSubmit,
      llmEnrichment: config.flags.llmEnrichment,
      maxBatchSize: config.pipeline.maxBatchSize,
    },
  });
});

// --- 404 + error handling -------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: "Not found", path: req.path, id: req.id });
});

// eslint-disable-next-line no-unused-vars -- Express needs the 4-arg signature.
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) logger.error("request failed", { id: req.id, path: req.path, err: err.message });
  else logger.warn("request rejected", { id: req.id, path: req.path, err: err.message });
  res.status(status).json({
    // Never leak internals in production.
    error: status >= 500 && config.isProd ? "Internal server error" : err.message,
    id: req.id,
  });
});

// --- Boot -----------------------------------------------------------------
/**
 * Optional background work. Never runs in test, and only runs when explicitly
 * enabled, because it spends API quota on every deploy.
 */
const startBackgroundWork = () => {
  if (config.isTest || !config.flags.warmCacheOnBoot) return;

  const warmJobCache = () => {
    import("./middleware/services/scraperService.js")
      .then((m) => m.scrapeJobs({}))
      .then((jobs) => logger.info("job cache warmed", { count: jobs?.length || 0 }))
      .catch((e) => logger.warn("job cache warm-up failed", { err: e.message }));
  };
  setTimeout(warmJobCache, 15 * 1000).unref();
  setInterval(warmJobCache, config.jobs.cacheTtlMs).unref();
};

/**
 * Boot self-test: verify model ids and probe every configured provider so the
 * server never reports "llm+local" on the strength of a key alone.
 * Skipped in tests and when LLM_SELFTEST=off.
 */
const runStartupSelfTest = async () => {
  if (config.isTest || process.env.LLM_SELFTEST === "off") return null;
  try {
    return await runSelfTest({ print: true });
  } catch (err) {
    logger.warn("llm self-test could not run", { err: scrubError(err?.message) });
    return null;
  }
};

export const start = async () => {
  // Fail fast: no listener until the database is actually usable.
  await connectDB();

  // Test the providers before announcing that the server is up, so llmMode in
  // the startup log always carries measured PASS/FAIL results.
  const selfTest = await runStartupSelfTest();

  const server = app.listen(config.port, () => {
    const llm = llmHealth();
    logger.info("server listening", {
      port: config.port,
      env: config.env,
      // e.g. "groq:OK openrouter:FAIL(401) gemini:OK"
      llmMode: selfTest?.mode || (llm.anyProvider ? "llm+local" : "local-only"),
    });
    startBackgroundWork();
  });

  const shutdown = (signal) => {
    logger.info("shutting down", { signal });
    // Do not hang forever on a stuck connection.
    const force = setTimeout(() => process.exit(1), 10000);
    force.unref();
    server.close(async () => {
      try {
        await disconnectDB();
      } catch (err) {
        logger.warn("error during shutdown", { err: err.message });
      } finally {
        clearTimeout(force);
        process.exit(0);
      }
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  return server;
};

// Only auto-start when run directly — tests import the app without listening.
const isDirectRun = Boolean(process.argv[1]) && process.argv[1].endsWith("server.js");
if (isDirectRun) {
  start().catch((err) => {
    logger.error("failed to start", { err: err.message });
    process.exit(1);
  });
}

export { app };
export default app;

