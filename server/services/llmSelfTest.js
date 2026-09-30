/**
 * LLM self-test — run at boot (and by `npm run llm:check`).
 *
 * It answers three questions with real network calls, not with "is a key set":
 *   1. Which model ids does each provider still serve?  (GET /models)
 *   2. Does each configured model answer a minimal request right now?
 *   3. Therefore what is llmMode:  "groq:OK openrouter:FAIL(401) gemini:OK"
 *
 * Every row is produced by the router's own request builder, so a PASS here
 * means the exact code path that /extract-resume uses is working.
 */
import logger from "../utils/logger.js";
import {
  isModelDead,
  probeModel,
  providerConfig,
  providerNames,
  setSelfTest,
  verifyModelLists,
} from "./llmRouter.js";

const pad = (value, width) => String(value ?? "").padEnd(width).slice(0, width);

/** Human-readable PASS/FAIL table (this is what gets pasted into a review). */
const printTable = (rows) => {
  const header = [pad("PROVIDER", 12), pad("MODEL", 34), pad("RESULT", 7), pad("STATUS", 7), pad("MS", 6), "DETAIL"];
  const lines = rows.map((r) =>
    [
      pad(r.provider, 12),
      pad(r.model || "-", 34),
      pad(r.ok === null ? "SKIP" : r.ok ? "PASS" : "FAIL", 7),
      pad(r.status ?? "-", 7),
      pad(r.latencyMs ?? 0, 6),
      r.reason || r.errorType || "",
    ].join(" ")
  );
  const width = Math.max(...[...lines, header.join(" ")].map((l) => l.length));
  const rule = "-".repeat(width);
  console.log("\n+-" + rule + "-+");
  console.log("| " + header.join(" ") + " |");
  console.log("+-" + rule + "-+");
  for (const line of lines) console.log("| " + line.padEnd(width) + " |");
  console.log("+-" + rule + "-+");
};

/** Compact per-provider mode string, e.g. "groq:OK openrouter:FAIL(401)". */
const modeOf = (rows) => {
  const configured = rows.filter((r) => r.ok !== null);
  if (!configured.length) return "local-only";
  const byProvider = new Map();
  for (const row of configured) {
    if (!byProvider.has(row.provider)) byProvider.set(row.provider, row);
  }
  return [...byProvider.entries()]
    .map(([provider, row]) =>
      row.ok ? `${provider}:OK` : `${provider}:FAIL(${row.status || row.errorType || "error"})`
    )
    .join(" ");
};

/**
 * Verify model ids, probe every configured provider, print the table and publish
 * the result to the router (health() reports it as `llm.selfTest`).
 */
export const runSelfTest = async ({ print = true, timeoutMs } = {}) => {
  const startedAt = Date.now();

  // 1. Model-list verification (also learns per-model JSON-mode support).
  const modelRows = await verifyModelLists();

  // 2. One minimal real call per configured, live model.
  const rows = [];
  for (const provider of providerNames) {
    const { apiKey, models } = providerConfig(provider);
    if (!apiKey) {
      rows.push({
        provider,
        model: models[0] || null,
        ok: null,
        status: null,
        latencyMs: 0,
        reason: "no API key configured",
      });
      continue;
    }
    for (const model of models) {
      if (isModelDead(provider, model)) {
        rows.push({
          provider,
          model,
          ok: false,
          status: null,
          latencyMs: 0,
          errorType: "model_not_found",
          reason: "not in provider model list",
        });
        continue;
      }
      const result = await probeModel(provider, model, timeoutMs ? { timeoutMs } : {});
      rows.push({
        provider,
        model,
        ok: result.ok,
        status: result.status,
        latencyMs: result.latencyMs,
        errorType: result.errorType,
        reason: result.detail,
      });
    }
  }

  const tested = rows.filter((r) => r.ok !== null);
  const passed = tested.filter((r) => r.ok);
  const result = {
    ranAt: new Date().toISOString(),
    rows,
    modelRows,
    mode: modeOf(rows),
    summary: tested.length ? `${passed.length}/${tested.length} configured models answered` : "no providers configured",
    totalMs: Date.now() - startedAt,
  };
  setSelfTest(result);

  if (print) printTable(rows);
  // Machine-readable copy: same numbers, no free text to grep by accident.
  logger.info("llm self-test", {
    mode: result.mode,
    summary: result.summary,
    totalMs: result.totalMs,
    providers: rows.map((r) => ({
      provider: r.provider,
      model: r.model,
      result: r.ok === null ? "SKIP" : r.ok ? "PASS" : "FAIL",
      status: r.status ?? null,
      latencyMs: r.latencyMs,
      errorType: r.errorType ?? null,
      reason: r.reason ?? null,
    })),
  });
  return result;
};

export default { runSelfTest };
