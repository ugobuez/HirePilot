import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import mongoose from "mongoose";
import config from "./index.js";
import logger from "../utils/logger.js";

let memoryServer = null;

/** Persistent dev database lives here; so does the running-instance marker. */
const devDbPath = () => path.resolve(process.cwd(), "..", ".data", "mongo");
const instanceFile = (dbPath = devDbPath()) => path.join(dbPath, "hirepilot-instance.json");

const writeInstanceFile = (uri) => {
  const dbPath = devDbPath();
  try {
    fs.mkdirSync(dbPath, { recursive: true });
    fs.writeFileSync(
      instanceFile(dbPath),
      JSON.stringify({ uri, pid: process.pid, port: Number(new URL(uri).port) || 27017, startedAt: new Date().toISOString() }, null, 2)
    );
  } catch (err) {
    logger.warn("could not record the running mongo instance", { err: err.message });
  }
};

const removeOwnInstanceFile = () => {
  const file = instanceFile();
  try {
    const info = JSON.parse(fs.readFileSync(file, "utf8"));
    if (info.pid === process.pid) fs.unlinkSync(file);
  } catch {
    /* nothing of ours to clean up */
  }
};

/**
 * Connection info for a dev mongod that is already running on our dbPath, or
 * null. This is what lets `npm run seed` reuse the server's database instead of
 * starting a second mongod on the same data directory (which then fails on the
 * lock file and, on some machines, corrupts the journal).
 */
export const readRunningInstance = () => {
  try {
    const info = JSON.parse(fs.readFileSync(instanceFile(), "utf8"));
    return info?.uri ? info : null;
  } catch {
    return null;
  }
};

const pidAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM = the process exists but belongs to another user.
    return err.code === "EPERM";
  }
};

const portAlive = (port) =>
  new Promise((resolve) => {
    if (!Number.isInteger(port) || port <= 0) return resolve(false);
    const socket = net.createConnection({ port, host: "127.0.0.1" });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1500, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });

/** A recorded instance is only reusable while its process or port is alive. */
export const verifyRunningInstance = async (info = readRunningInstance()) => {
  if (!info) return null;
  if (pidAlive(info.pid)) return info;
  return (await portAlive(info.port)) ? info : null;
};

/**
 * Delete lock files left behind by a mongod that died without cleaning up.
 * A no-op while a live instance is listening, so a running database is never
 * touched.
 */
export const clearStaleMongoLocks = async (dbPath = devDbPath(), probe = verifyRunningInstance) => {
  if (await probe()) return { cleared: [], kept: true };
  const cleared = [];
  for (const name of ["mongod.lock", "WiredTiger.lock"]) {
    const file = path.join(dbPath, name);
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        cleared.push(name);
      }
    } catch {
      /* another process may be starting; let mongod report the real problem */
    }
  }
  return { cleared, kept: false };
};

/**
 * Attach to an already-running dev database. Returns null when there is none or
 * when the recorded instance is unreachable (stale marker), so the caller can
 * fall back to starting its own mongod.
 */
export const connectToRunningInstance = async () => {
  const instance = await verifyRunningInstance();
  if (!instance) return null;
  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(instance.uri, { serverSelectionTimeoutMS: 3000 });
    logger.info("database connected", { db: "running dev instance" });
    return mongoose.connection;
  } catch (err) {
    logger.warn("recorded mongo instance is unreachable, starting a new one", { err: err.message });
    removeOwnInstanceFile();
    await clearStaleMongoLocks();
    return null;
  }
};

/**
 * Resolve a Mongo connection string.
 * - production: MONGO_URI is required (Atlas free tier)
 * - development/test with no MONGO_URI: spin up an embedded MongoDB so
 *   `npm run dev` and `npm test` work with zero external services.
 */
const resolveUri = async () => {
  if (config.mongoUri) return config.mongoUri;
  if (config.isProd) {
    throw new Error("MONGO_URI is required in production");
  }

  const { MongoMemoryServer } = await import("mongodb-memory-server");

  if (config.isTest || config.mongoMemoryEphemeral) {
    memoryServer = await MongoMemoryServer.create({ instance: { dbName: "hirepilot" } });
    return memoryServer.getUri("hirepilot");
  }

  // Persistent dev database: data survives restarts under ./.data/mongo.
  const dbPath = devDbPath();
  fs.mkdirSync(dbPath, { recursive: true });

  // A second process (npm run seed, scripts/db-check) must never start a second
  // mongod on the same data directory: reuse the one that is already running.
  const running = await verifyRunningInstance();
  if (running) return running.uri;

  // Nobody is listening: clear lock files left behind by a crash, otherwise
  // mongod refuses to start on this directory.
  const { cleared } = await clearStaleMongoLocks(dbPath);
  if (cleared.length) logger.info("cleared stale mongo lock files", { files: cleared });

  memoryServer = await MongoMemoryServer.create({
    instance: { dbName: "hirepilot", dbPath },
    instanceInfoDir: dbPath,
  });
  const uri = memoryServer.getUri("hirepilot");
  writeInstanceFile(uri);
  return uri;
};

export const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  let uri;
  try {
    uri = await resolveUri();
  } catch (err) {
    const msg = String(err?.message || err);
    if (/lock|Unable to lock|already in use/i.test(msg)) {
      throw new Error(
        [
          "Cannot start the embedded MongoDB: the data directory ./.data/mongo is in use.",
          "Another process (dev server, seed script) is probably still running.",
          "  1) Stop it, then run the seed again",
          "  2) Or point MONGO_URI at your own mongod / Atlas cluster",
          `Original error: ${msg}`,
        ].join("\n")
      );
    }
    if (/download|binary|EACCES|ENOTFOUND|checksum/i.test(msg)) {
      throw new Error(
        [
          "Could not start the embedded MongoDB (first run downloads a small binary).",
          "Network or proxy blocked the download. Options:",
          "  1) Re-run with network access so the binary can be cached under ./.cache/mongodb-binaries",
          "  2) Point MONGO_URI at a local mongod or a free MongoDB Atlas cluster",
          `Original error: ${msg}`,
        ].join("\n")
      );
    }
    throw err;
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  logger.info("database connected", { db: config.isProd ? "atlas" : "embedded" });
  return mongoose.connection;
};

export const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
  // Only remove the marker if this process is the one that wrote it.
  removeOwnInstanceFile();
};

export default connectDB;
