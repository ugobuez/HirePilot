import jwt from "jsonwebtoken";
import User from "../models/User.js";

const JWT_SECRET = process.env.JWT_SECRET || "hirepilot_jwt_secret_key_2024";

export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ error: "Not authorized, no token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(decoded.userId).select("-password");
    if (!req.user) {
      return res.status(401).json({ error: "User not found" });
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Not authorized, token invalid" });
  }
};

export const generateToken = (userId, email) => {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: "7d" });
};

// Middleware to enforce daily application limits
export const getUserApplicationLimit = (email) => {
  const PREMIUM_EMAIL = "ugochukwumeshach8@gmail.com";
  const PREMIUM_LIMIT = 50;
  const STANDARD_LIMIT = 20;

  if (email === PREMIUM_EMAIL) {
    return PREMIUM_LIMIT;
  }
  return STANDARD_LIMIT;
};

// Reset daily count if calendar day changed
export const checkAndResetDailyLimit = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastApplied = new Date(user.lastAppliedDate);
    lastApplied.setHours(0, 0, 0, 0);

    if (today.getTime() !== lastApplied.getTime()) {
      user.dailyApplicationsCount = 0;
      user.lastAppliedDate = new Date();
      await user.save();
    }

    const limit = getUserApplicationLimit(user.email);
    if (user.dailyApplicationsCount >= limit) {
      return res.status(429).json({
        error: "Daily application limit reached",
        limit,
        currentCount: user.dailyApplicationsCount,
      });
    }

    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};