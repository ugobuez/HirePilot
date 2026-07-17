import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    dailyApplicationsCount: {
      type: Number,
      default: 0,
    },
    lastAppliedDate: {
      type: Date,
      default: Date.now,
    },
    baseResumeText: {
      type: String,
      default: "",
    },
    lastAutoApplyAt: {
      type: Date,
    },
    settings: {
      minAts: { type: Number, default: 70 },
      dailyLimit: { type: Number, default: 20 },
      countries: { type: [String], default: [] },
      jobBoards: { type: [String], default: ["LinkedIn", "Indeed", "Jobberman"] },
      remoteOnly: { type: Boolean, default: false },
      keywords: { type: [String], default: [] },
      blacklistCompanies: { type: [String], default: [] },
      preferredTitles: { type: [String], default: [] },
      autoApplyEnabled: { type: Boolean, default: false },
      autoApplyInterval: { type: Number, default: 30 },
      salaryMin: { type: Number, default: 0 },
      employmentTypes: { type: [String], default: ["Full-Time"] },
    },
    onboardingDetails: {
      fullName: { type: String },
      email: { type: String },
      phone: { type: String },
      location: { type: String, default: "Nigeria" },
      isAuthorizedToWorkInUS: { type: Boolean, default: false },
      requiresSponsorship: { type: Boolean, default: true },
      employmentTypePref: {
        type: String,
        enum: ["Full-Time", "Contract", "Both"],
        default: "Full-Time",
      },
      salaryExpectations: String,
      linkedInUrl: String,
      gitHubUrl: String,
      personalWebsite: String,
      skillsList: [String],
      yearsOfExperience: Number,
    },
  },
  { timestamps: true }
);

// Pre-save hook: hash password if modified
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Instance method: compare candidate password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("User", userSchema);