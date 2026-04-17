import mongoose from "mongoose";

const resumeSchema = new mongoose.Schema({
  userId: String,
  fileUrl: String,
  content: String, 
}, { timestamps: true });

export default mongoose.model("Resume", resumeSchema);