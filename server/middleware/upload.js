import multer from "multer";
import pdfParse from "pdf-parse-fixed";
import mammoth from "mammoth";
import fs from "fs";
// ============================
// Multer config
// ============================
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "application/rtf",
      "text/plain",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("❌ File type not allowed"), false);
    }
  },
});

// ============================
// Resume text extractor
// ============================import fs from "fs";


export async function extractResumeText(file) {
  try {
    const { mimetype, path } = file;

    console.log("📄 Extracting file:", mimetype);
    console.log("📂 File path:", path);

    if (!path) {
      throw new Error("File path not found");
    }

    const fileBuffer = fs.readFileSync(path);

    // DOCX
    if (
      mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({
        buffer: fileBuffer,
      });
      return result.value;
    }

    // PDF
    if (mimetype === "application/pdf") {
      const result = await pdfParse(fileBuffer);
      return result.text;
    }

    // TXT / RTF
    if (mimetype === "text/plain" || mimetype === "application/rtf") {
      return fileBuffer.toString("utf-8");
    }

    throw new Error(`Unsupported file type: ${mimetype}`);
  } catch (error) {
    console.error("❌ Extract Error:", error.message);
    throw error;
  }
}
// ============================
// Export multer
// ============================
export { upload };