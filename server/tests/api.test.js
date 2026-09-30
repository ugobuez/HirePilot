import request from "supertest";
import { app } from "../server.js";
import { startTestDb, stopTestDb, clearTestDb } from "./helpers/db.js";

beforeAll(async () => {
  await startTestDb();
});

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

describe("health", () => {
  it("reports the real database and LLM state", async () => {
    const res = await request(app).get("/api/health").expect(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.database).toBe("connected");
    expect(["local-only", "llm+local"]).toContain(res.body.llm.mode);
    expect(res.body.features.maxBatchSize).toBeGreaterThan(0);
    // Honest health: it must not claim a fixed set of always-true services.
    expect(res.body.services).toBeUndefined();
  });

  it("never exposes secrets", async () => {
    const res = await request(app).get("/api/health");
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/api[_-]?key/i);
    expect(body).not.toMatch(/jwt|secret|mongodb\+srv/i);
  });

  it("reports local-only mode when no LLM key is configured", async () => {
    const res = await request(app).get("/api/health");
    const providers = res.body.llm.providers;
    const any = Object.entries(providers)
      .filter(([k]) => k !== "localFallback")
      .some(([, v]) => v);
    expect(res.body.llm.mode).toBe(any ? "llm+local" : "local-only");
    expect(providers.localFallback).toBe(true);
  });
});

describe("http hardening", () => {
  it("returns json 404 for unknown routes", async () => {
    const res = await request(app).get("/api/definitely-not-a-route").expect(404);
    expect(res.body.error).toBe("Not found");
  });

  it("sets security headers and a request id", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-request-id"]).toMatch(/[0-9a-f-]{20,}/i);
  });

  it("echoes a caller-supplied request id", async () => {
    const id = "test-request-id-123456";
    const res = await request(app).get("/api/health").set("x-request-id", id);
    expect(res.headers["x-request-id"]).toBe(id);
  });

  it("rejects oversized json bodies", async () => {
    const big = { description: "x".repeat(2 * 1024 * 1024) };
    const res = await request(app).post("/api/jobs/scan").send(big);
    expect([413, 404, 400]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  it("serves the root endpoint as json", async () => {
    const res = await request(app).get("/").expect(200);
    expect(res.body.name).toBe("HirePilot API");
  });
});
