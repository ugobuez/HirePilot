import dns from "dns";

// Force Node to use public DNS servers
dns.setServers(["8.8.8.8", "8.8.4.4"]);
import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import aiRoutes from "./routes/aiRoutes.js";
import jobRoutes from "./routes/jobRoutes.js";
import applicationRoutes from "./routes/applicationRoutes.js";
import resumeRoutes from "./routes/resumeRoutes.js";
import scrapeRoutes from "./routes/scrapeRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import automationRoutes from "./routes/automationRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root (parent of server/)
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const app = express();

// CORS
const allowedOrigins = [
  "https://hire-pilot-job.vercel.app",
  "http://localhost:3000",
  "https://hirepilot-jber.onrender.com",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
    optionsSuccessStatus: 200,
  })
);

app.use(express.json());

// Routes

app.use("/api/resume", resumeRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/v1/applications", applicationRoutes);
app.use("/api", aiRoutes);     
app.use("/api", scrapeRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/automation", automationRoutes);

app.get("/", (req, res) => {
  res.send("✅ HirePilot Server is running...");
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    services: {
      auth: true,
      applications: true,
      automation: true,
      jobscan: true,
      tailor: true,
    },
  });
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err.message));

const PORT = process.env.PORT || 6900;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);

// Auto-apply scheduler: checks users with autoApplyEnabled every 60s.
// Each user is processed only when their interval has elapsed.
setInterval(() => {
  import("./middleware/services/autoApplyService.js")
    .then((m) => m.processAutoApplyQueue())
    .catch((e) => console.error("❌ Auto-apply scheduler error:", e.message));
}, 60 * 1000);

// Job aggregation warm-up: keeps the 100+ source cache fresh so users never
// wait on a cold scrape. Refreshes every 3 hours (matches the cache TTL) and
// once shortly after boot.
const warmJobCache = () => {
  import("./middleware/services/scraperService.js")
    .then((m) => m.scrapeJobs({}))
    .then((jobs) => console.log(`♻️ Job cache warmed: ${jobs.length} jobs aggregated`))
    .catch((e) => console.error("❌ Job cache warm-up error:", e.message));
};
setTimeout(warmJobCache, 15 * 1000);
setInterval(warmJobCache, 3 * 60 * 60 * 1000);
});