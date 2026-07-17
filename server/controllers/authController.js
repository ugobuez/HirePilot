import User from "../models/User.js";
import { generateToken } from "../middleware/auth.js";
import { extractResumeText } from "../middleware/upload.js";
import {
  extractProfileFromResume,
  generateProfessionalSummary,
} from "../middleware/services/profileExtractionService.js";

// POST /api/v1/auth/signup
export const signup = async (req, res) => {
  try {
    const { email, password, ...basicDetails } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists with this email" });
    }

    const user = await User.create({
      email: email.toLowerCase().trim(),
      password,
      onboardingDetails: {
        fullName: basicDetails.fullName || "",
        email: email.toLowerCase().trim(),
        phone: basicDetails.phone || "",
        location: basicDetails.location || "Nigeria",
        isAuthorizedToWorkInUS: basicDetails.isAuthorizedToWorkInUS || false,
        requiresSponsorship: basicDetails.requiresSponsorship || true,
        employmentTypePref: basicDetails.employmentTypePref || "Full-Time",
        salaryExpectations: basicDetails.salaryExpectations || "",
        linkedInUrl: basicDetails.linkedInUrl || "",
        gitHubUrl: basicDetails.gitHubUrl || "",
        personalWebsite: basicDetails.personalWebsite || "",
        skillsList: basicDetails.skillsList || [],
        yearsOfExperience: basicDetails.yearsOfExperience || 0,
      },
    });

    const token = generateToken(user._id, user.email);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        onboardingDetails: user.onboardingDetails,
        dailyApplicationsCount: user.dailyApplicationsCount,
        baseResumeText: user.baseResumeText,
      },
    });
  } catch (err) {
    console.error("❌ Signup error:", err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
};

// POST /api/v1/auth/login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken(user._id, user.email);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        onboardingDetails: user.onboardingDetails,
        dailyApplicationsCount: user.dailyApplicationsCount,
        baseResumeText: user.baseResumeText,
      },
    });
  } catch (err) {
    console.error("❌ Login error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v1/auth/me
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({
      user: {
        id: user._id,
        email: user.email,
        onboardingDetails: user.onboardingDetails,
        dailyApplicationsCount: user.dailyApplicationsCount,
        baseResumeText: user.baseResumeText,
        lastAppliedDate: user.lastAppliedDate,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/v1/auth/forgot-password
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // Return same message to avoid leaking which emails exist
      return res.json({
        message:
          "If an account exists for that email, a password reset link has been sent.",
      });
    }

    res.json({
      message:
        "If an account exists for that email, a password reset link has been sent.",
    });
  } catch (err) {
    console.error("❌ Forgot password error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/v1/auth/onboarding
export const updateOnboarding = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const updates = req.body;

    if (updates.onboardingDetails) {
      Object.assign(user.onboardingDetails, updates.onboardingDetails);
    }

    if (updates.baseResumeText !== undefined) {
      user.baseResumeText = updates.baseResumeText;
    }

    if (updates.dailyApplicationsCount !== undefined) {
      user.dailyApplicationsCount = updates.dailyApplicationsCount;
    }

    await user.save();

    res.json({
      user: {
        id: user._id,
        email: user.email,
        onboardingDetails: user.onboardingDetails,
        dailyApplicationsCount: user.dailyApplicationsCount,
        baseResumeText: user.baseResumeText,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/v1/auth/extract-resume  (upload resume -> AI profile)
export const extractResume = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Resume file is required" });
    }

    const resumeText = await extractResumeText(req.file);
    if (!resumeText || !resumeText.trim()) {
      return res.status(400).json({ error: "Could not extract text from the resume." });
    }

    const profile = await extractProfileFromResume(resumeText);
    const summary = profile.summary || (await generateProfessionalSummary(profile));

    res.json({ resumeText, profile: { ...profile, summary } });
  } catch (err) {
    console.error("❌ extract-resume error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v1/auth/profile  (current profile + AI career metrics)
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const od = user.onboardingDetails || {};
    const skills = od.skillsList || [];

    const fields = [
      od.fullName, od.email, od.phone, od.location, od.linkedInUrl || od.gitHubUrl,
      od.skillsList?.length, od.yearsOfExperience, od.salaryExpectations,
    ];
    const filled = fields.filter(Boolean).length;
    const profileCompleteness = Math.round((filled / fields.length) * 100);
    const resumeScore = Math.min(100, 50 + skills.length * 4 + (od.yearsOfExperience || 0) * 2);
    const expected = ["JavaScript", "TypeScript", "React", "Node.js", "Git", "SQL", "REST APIs", "CI/CD", "AWS", "Docker"];
    const missingSkills = expected.filter((s) => !skills.some((k) => k.toLowerCase().includes(s.toLowerCase()))).slice(0, 6);
    const interviewReadiness = Math.min(100, profileCompleteness + (skills.length >= 5 ? 20 : 0) - 10);

    const metrics = {
      profileCompleteness,
      resumeScore,
      missingSkills,
      interviewReadiness,
      suggestedCerts: skills.length ? ["AWS Certified Cloud Practitioner", "Meta Front-End Developer", "Scrimba Frontend Career Path"] : [],
      careerRecs: skills.length ? [`Add ${missingSkills[0] || "a trending framework"} to strengthen your profile.`, "Quantify achievements with metrics in your resume."] : ["Upload a resume to get personalized recommendations."],
    };

    res.json({
      onboardingDetails: od,
      settings: user.settings || {},
      baseResumeText: user.baseResumeText || "",
      metrics,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};