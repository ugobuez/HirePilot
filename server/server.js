import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";

import aiRoutes from "./routes/aiRoutes.js";
import jobRoutes from "./routes/jobRoutes.js";
import applicationRoutes from "./routes/applicationRoutes.js";

dotenv.config();

const app = express();

// ✅ Allowed origins
const allowedOrigins = [
  "https://hire-pilot-job.vercel.app",
  "http://localhost:3000",
  "https://hirepilot-qskd.onrender.com"
];

// ✅ FIXED CORS setup
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("❌ Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST"],
  credentials: true
}));

// ✅ Handle preflight requests
app.options("*", cors());

app.use(express.json());

// ✅ API routes
app.use("/api", aiRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/applications", applicationRoutes);

// ✅ Test route
app.get("/", (req, res) => {
  res.send("✅ HirePilot Server is running...");
});

// ✅ MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err.message));

const PORT = process.env.PORT || 6900;

app.listen(PORT, () => {
  console.log("=================================");
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 URL: http://localhost:${PORT}`);
  console.log("=================================");
});