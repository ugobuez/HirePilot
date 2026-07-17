import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    jobTitle: { type: String, required: true },
    company: { type: String, required: true },
    location: String,
    jobDescription: String,
    salary: String,
    source: {
      type: String,
      enum: ["LinkedIn", "Indeed", "Jobberman", "Manual", "Auto", "Other"],
      default: "LinkedIn",
    },
    status: {
      type: String,
      enum: [
        "Scraped",
        "Saved",
        "Interested",
        "Tailoring",
        "Queued",
        "Applied",
        "Assessment",
        "Phone Screen",
        "Technical",
        "Hiring Manager",
        "Interviewing",
        "Final Interview",
        "Negotiation",
        "Offered",
        "Accepted",
        "Rejected",
        "Withdrawn",
        "Ghosted",
        "Archived",
      ],
      default: "Scraped",
    },
    matchRate: Number,
    tailoredResumeText: String,
    coverLetterText: String,
    appliedAt: Date,
    notes: String,
    history: [
      {
        status: String,
        changedAt: { type: Date, default: Date.now },
        note: String,
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Application", applicationSchema);