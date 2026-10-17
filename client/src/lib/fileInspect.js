import { fileKey, getExtension } from "./fileUtils";
import { readPdfMeta } from "./pdfMeta";

// Client-side first knowledge about a picked file: an image gets a local
// thumbnail, a PDF gets its page count and an upfront answer about
// password protection, so the user knows what will happen before running
// the tool. No bytes leave the browser.
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif", ".tiff", ".tif"]);

// The extension set the server validation accepts across every operation.
export const KNOWN_EXTENSIONS = new Set([
  ".pdf", ".docx", ".pptx", ".xlsx", ".zip",
  ".jpg", ".jpeg", ".png", ".webp", ".avif", ".tiff", ".tif",
  ".txt",
]);

export async function inspectFile(file) {
  const extension = getExtension(file.name);
  const info = { key: fileKey(file), objectUrl: "", pages: 0, encrypted: false, damaged: "" };

  if (IMAGE_EXTS.has(extension)) {
    info.objectUrl = URL.createObjectURL(file);
    return info;
  }

  if (extension !== ".pdf") return info;

  const meta = await readPdfMeta(file);
  return { ...info, ...meta };
}
