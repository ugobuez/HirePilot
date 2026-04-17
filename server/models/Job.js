// models/Job.js
import mongoose from "mongoose";

const jobSchema = new mongoose.Schema({
  title:      String,
  company:    String,
  description: String,
  applyLink:  String,
  source:     String,
  datePosted: String,
}, { timestamps: true });

export default mongoose.model("Job", jobSchema);