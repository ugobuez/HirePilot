/**
 * Dev database check: proves `npm run dev` has a working database with zero
 * setup. Run: node scripts/db-check.js
 */
import { connectDB, disconnectDB } from "../config/db.js";

const started = Date.now();
try {
  const conn = await connectDB();
  console.log(`db connected in ${Date.now() - started}ms | state=${conn.readyState} | name=${conn.name}`);
  await disconnectDB();
  console.log("db disconnected cleanly");
} catch (err) {
  console.log("DB FAIL:", String(err.message).split("\n").slice(0, 8).join("\n"));
  process.exitCode = 1;
}
