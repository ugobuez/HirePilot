import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";


import aiRoutes from "./routes/aiRoutes.js";
import jobRoutes from "./routes/jobRoutes.js";
import applicationRoutes from "./routes/applicationRoutes.js";

dotenv.config();

const app = express();

app.use(cors({ origin: "http://localhost:3000", methods: ["GET", "POST"] }));
app.use(express.json());

// API routes
app.use("/api", aiRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/applications", applicationRoutes);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1); // Stop the server if DB fails
  }
};

// Call the connection
connectDB();

const PORT = process.env.PORT || 6900;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

