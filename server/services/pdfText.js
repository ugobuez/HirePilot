import os from "node:os";
import fs from "node:fs";
import { extractWithZlib } from "./roundTrip.js";

/**
 * Extract text from a PDF buffer, robustly.
 *
 * pdfjs (via pdf-parse) mis-reads some in-memory Buffers ("bad XRef entry")
 * although the very same bytes parse fine from disk, so the primary path writes
 * a temp file. A dependency-free zlib/content-stream extractor is the backstop,
 * which also keeps resume upload working if pdf-parse is unavailable.
 *
 * @param {Buffer} buffer
 * @returns {Promise<{text: string, extractor: string}>}
 */
export const extractPdfText = async (buffer) => {
  let pdfParse = null;
  try {
    const mod = await import("pdf-parse");
    pdfParse = mod.default || mod;
  } catch {
    pdfParse = null;
  }

  if (pdfParse) {
    const tmp = `${os.tmpdir()}/hirepilot-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
    try {
      fs.writeFileSync(tmp, buffer);
      const out = await pdfParse(tmp);
      const text = String(out?.text || "").trim();
      if (text.length >= 40) return { text, extractor: "pdfjs" };
    } catch {
      // fall through to the zlib extractor
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* best effort cleanup */
      }
    }
  }

  const fallback = await extractWithZlib(buffer);
  return { text: fallback.text || "", extractor: fallback.available ? "zlib" : "none" };
};

export default extractPdfText;
