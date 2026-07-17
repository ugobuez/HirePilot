import express from "express";
import { signup, login, getMe, updateOnboarding, forgotPassword, extractResume, getProfile } from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

// POST /api/v1/auth/signup
router.post("/signup", signup);

// POST /api/v1/auth/login
router.post("/login", login);

// POST /api/v1/auth/forgot-password
router.post("/forgot-password", forgotPassword);

// GET /api/v1/auth/me (protected)
router.get("/me", protect, getMe);

// PUT /api/v1/auth/onboarding (protected)
router.put("/onboarding", protect, updateOnboarding);

// POST /api/v1/auth/extract-resume (protected) — upload resume -> AI profile
router.post("/extract-resume", protect, upload.single("resume"), extractResume);

// GET /api/v1/auth/profile (protected) — profile + career metrics
router.get("/profile", protect, getProfile);

export default router;