import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";

import aiRoutes from "./routes/aiRoutes.js";
import jobRoutes from "./routes/jobRoutes.js";
import applicationRoutes from "./routes/applicationRoutes.js";

dotenv.config();

const app = express();

// ✅ CORS setup
app.use(cors({
  origin: [
    "https://hire-pilot-job.vercel.app",
    "http://localhost:3000",
    "https://hirepilot-qskd.onrender.com"
  ],
  methods: ["GET", "POST"],
  credentials: true
}));

app.use(express.json());

// ✅ API routes
app.use("/api", aiRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/applications", applicationRoutes);

app.get("/", (req, res) => {
  res.send("HirePilot Server is running...");
});

// ✅ MongoDB connection 
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected ✅"))
  .catch((err) => console.error("MongoDB error ❌", err));

// ❌ REMOVED: connectDB(); (this was causing your crash)

const PORT = process.env.PORT || 6900;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});