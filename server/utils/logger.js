import crypto from "node:crypto";
import config from "../config/index.js";

const REDACT_KEYS = /(api[_-]?key|authorization|cookie|password|secret|token|ssn|email|phone)/i;

export const newRequestId = () => crypto.randomUUID();

/** Recursively redact PII/secrets from anything bound to a log line. */
export const redact = (value, depth = 0) => {
  if (depth > 4 || value == null) return value;
  if (typeof value === "string") {
    // Opaque identifiers (UUIDs, hashes) are safe and must stay readable.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return value;
    if (/^[0-9a-f]{32,}$/i.test(value)) return value;
    return value
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
      // A phone number never starts in the middle of a hex/word run.
      .replace(/(?<![0-9A-Za-z])[+(]?\d[\d\s().-]{7,}\d/g, "[phone]")
      .slice(0, 500);
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (REDACT_KEYS.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    out[k] = redact(v, depth + 1);
  }
  return out;
};

const write = (level, msg, meta) => {
  const line = {
    level,
    time: new Date().toISOString(),
    msg,
    ...(config.isTest ? {} : { env: config.env }),
    ...(meta ? { meta: redact(meta) } : {}),
  };
  const text = JSON.stringify(line);
  if (level === "error") process.stderr.write(text + "\n");
  else process.stdout.write(text + "\n");
};

const logger = {
  info: (msg, meta) => write("info", msg, meta),
  warn: (msg, meta) => write("warn", msg, meta),
  error: (msg, meta) => write("error", msg, meta),
  debug: (msg, meta) => {
    if (config.env !== "development") return;
    write("debug", msg, meta);
  },
};

export default logger;
