// models/Job.js
import mongoose from "mongoose";

const jobSchema = new mongoose.Schema(
  {
    // External identity
    title: { type: String },
    company: { type: String },
    location: { type: String },
    description: { type: String },
    applyLink: { type: String },
    source: { type: String },
    category: { type: String },
    priority: { type: Number, default: 2 },
    externalId: { type: String },

    // Derived quality metadata
    skills: { type: [String], default: [] },
    salary: { type: String },
    remote: { type: Boolean, default: false },
    visaSponsorship: { type: Boolean, default: false },
    easyApply: { type: Boolean, default: false },
    experienceLevel: { type: String },
    companyReputation: { type: Number, default: 1 },
    postedDate: { type: String },
    hiringNow: { type: Boolean, default: false },
    startup: { type: Boolean, default: false },
    bigTech: { type: Boolean, default: false },
    africa: { type: Boolean, default: false },
    qualityScore: { type: Number, default: 0 },

    // Optional resume match (when scored for a user)
    atsScore: { type: Number },
  },
  { timestamps: true }
);

jobSchema.index({ title: 1, company: 1, location: 1 }, { unique: false });

export default mongoose.model("Job", jobSchema);
