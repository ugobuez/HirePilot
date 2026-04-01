import multer from "multer";

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, file.originalname), // preserve extension
});

export const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
      "application/msword", // doc
      "application/rtf",
      "image/jpeg",
      "image/png",
      "image/tiff",
      "image/bmp",
      "image/webp",
    ];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("File type not allowed"));
  },
});