import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";

import aiRoutes from "./routes/aiRoutes.js";
import jobRoutes from "./routes/jobRoutes.js";
import applicationRoutes from "./routes/applicationRoutes.js";
import resumeRoutes from "./routes/resumeRoutes.js";
import aiRoutesMatch from "./routes/aiRoutesMatch.js"; 
import scrapeRoutes from "./routes/scrapeRoutes.js";

dotenv.config();

const app = express();

// CORS
const allowedOrigins = [
  "https://hire-pilot-job.vercel.app",
  "http://localhost:3000",
  "https://hirepilot-qskd.onrender.com",
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
app.use("/api/applications", applicationRoutes);
app.use("/api", aiRoutesMatch); 
app.use("/api", aiRoutes);     
app.use("/api", scrapeRoutes);

app.get("/", (req, res) => {
  res.send("✅ HirePilot Server is running...");
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err.message));

const PORT = process.env.PORT || 6900;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});