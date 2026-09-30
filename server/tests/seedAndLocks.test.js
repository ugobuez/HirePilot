/**
 * Part 1 — concurrency and stale state around the dev database.
 *
 * Two mongod processes on the same data directory fight over the lock files,
 * which is why `npm run seed` used to fail (or, worse, touch a live database)
 * while the dev server was running.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import { clearStaleMongoLocks, connectDB, verifyRunningInstance } from "../config/db.js";
import { seedDatabase, SEED_USER } from "../scripts/seed.js";
import User from "../models/User.js";
import { startTestDb, stopTestDb, clearTestDb } from "./helpers/db.js";

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "hirepilot-lock-"));
const lockFiles = (dir) => ["mongod.lock", "WiredTiger.lock"].map((n) => path.join(dir, n));

describe("stale mongod lock files", () => {
  it("clears locks left behind by a crashed mongod", async () => {
    const dir = tempDir();
    for (const file of lockFiles(dir)) fs.writeFileSync(file, "12345");

    const result = await clearStaleMongoLocks(dir, async () => null);
    expect(result.kept).toBe(false);
    expect(result.cleared).toEqual(["mongod.lock", "WiredTiger.lock"]);
    expect(lockFiles(dir).some((f) => fs.existsSync(f))).toBe(false);
  });

  it("never touches a database that is still running", async () => {
    const dir = tempDir();
    for (const file of lockFiles(dir)) fs.writeFileSync(file, "12345");

    const result = await clearStaleMongoLocks(dir, async () => ({ uri: "mongodb://127.0.0.1:27017/hirepilot" }));
    expect(result).toEqual({ cleared: [], kept: true });
    expect(lockFiles(dir).every((f) => fs.existsSync(f))).toBe(true);
  });

  it("does nothing when there is nothing to clear", async () => {
    const dir = tempDir();
    const result = await clearStaleMongoLocks(dir, async () => null);
    expect(result.cleared).toEqual([]);
  });
});

describe("running-instance detection", () => {
  it("trusts a live process id", async () => {
    const info = { uri: "mongodb://127.0.0.1:1/hirepilot", pid: process.pid, port: 1 };
    await expect(verifyRunningInstance(info)).resolves.toMatchObject({ pid: process.pid });
  });

  it("rejects a dead process id on a closed port", async () => {
    const info = { uri: "mongodb://127.0.0.1:1/hirepilot", pid: 999999, port: 1 };
    await expect(verifyRunningInstance(info)).resolves.toBeNull();
  });

  it("rejects a missing marker", async () => {
    await expect(verifyRunningInstance(null)).resolves.toBeNull();
  });
});

describe("seeding while a database is already running", () => {
  beforeAll(async () => {
    await startTestDb();
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("reuses the live connection instead of starting a second mongod", async () => {
    const before = {
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
    };

    await seedDatabase();

    // Same server, same database: no second mongod, no lock fight.
    expect({
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
    }).toEqual(before);
    expect(await User.countDocuments({ email: SEED_USER.email })).toBe(1);
  });

  it("connectDB is a no-op when a connection already exists", async () => {
    const conn = await connectDB();
    expect(conn).toBe(mongoose.connection);
    expect(mongoose.connection.readyState).toBe(1);
  });
});
