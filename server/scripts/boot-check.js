/**
 * Boot check: starts the real server (embedded DB in dev), hits the health and
 * 404 endpoints, then shuts down. Run: node scripts/boot-check.js
 */
import { start } from "../server.js";

const server = await start();
const base = `http://127.0.0.1:${server.address().port}`;

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
};

try {
  const health = await fetch(`${base}/api/health`);
  const body = await health.json();
  check("health returns 200", health.status === 200, `${health.status}`);
  check("status is ok", body.status === "ok", String(body.status));
  check("database connected", body.database === "connected", String(body.database));
  check("llm mode reported", typeof body.llm?.mode === "string", `${body.llm?.mode}`);
  check("llm budget reported", typeof body.llm?.budget?.limitPerMinute === "number", "");
  check("no internal details leaked", !("env" in body) || body.env === "development", "");
  console.log("      health:", JSON.stringify(body.llm?.providers));

  const root = await fetch(`${base}/`);
  check("root returns JSON", (root.headers.get("content-type") || "").includes("json"), "");

  const missing = await fetch(`${base}/api/nope`);
  check("unknown route is 404 json", missing.status === 404, `${missing.status}`);

  const helmetHeader = health.headers.get("x-content-type-options");
  check("helmet sets nosniff", helmetHeader === "nosniff", String(helmetHeader));

  const reqId = health.headers.get("x-request-id");
  check("request id is returned", Boolean(reqId && reqId.length > 10), String(reqId).slice(0, 12));

  const rateHeaders = health.headers.get("ratelimit");
  check("rate limiter is active", Boolean(rateHeaders), String(rateHeaders));
} catch (err) {
  check("boot check ran", false, err.message);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - failed.length}/${results.length} boot checks passed ===`);
if (failed.length) process.exitCode = 1;

// The embedded Mongo keeps handles open; exit explicitly so the script returns.
const { disconnectDB } = await import("../config/db.js");
await disconnectDB().catch(() => {});
process.exit(failed.length ? 1 : 0);
