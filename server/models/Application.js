import mongoose from "mongoose";

const appSchema = new mongoose.Schema({
  userId: String,
  jobId: String,
  title: String,
  company: String,
  location: String,
  status: {
    type: String,
    enum: ["Applied", "Interview", "Rejected"],
    default: "Applied",
  },
  appliedAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Application", appSchema);