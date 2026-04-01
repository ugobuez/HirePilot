// server/middleware/upload.js
import multer from "multer";

// Store files in memory for serverless environments
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "application/rtf",
    ];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("File type not allowed"));
  },
});