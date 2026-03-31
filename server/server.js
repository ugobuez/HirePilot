import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import aiRoutes from "./routes/aiRoutes.js";
import jobRoutes from "./routes/jobRoutes.js";
import applicationRoutes from "./routes/applicationRoutes.js";

dotenv.config();

const app = express();

app.use(cors({ origin: "*" }));

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
  ;
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 URL: http://localhost:${PORT}`);
  ;
});