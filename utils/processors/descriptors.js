// Shared output-naming and descriptor helpers used by every operation
// handler in registry.js. Router.js and registry.js both import from here.
import path from "node:path";
import fs from "fs-extra";
import mime from "mime-types";
import { AppError } from "../errors.js";

export function unsupportedFile(
  reason = "This operation is not available for this file type",
) {
  return new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, { reason });
}

export function sanitizeBaseName(name) {
  const raw = (name || "file").trim();
  const safe = raw.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
  return safe || "file";
}

export function createOutputPath(outputBasePath, extension) {
  return `${outputBasePath}${extension}`;
}

export function createPerFileOutputBase(outputBasePath, index, sourceName) {
  const base = sanitizeBaseName(
    path.parse(sourceName || `file_${index + 1}`).name,
  );
  return `${outputBasePath}_${index + 1}_${base}`;
}

export function createDescriptor({
  outputPath,
  outputExtension,
  sourceName,
  outputName,
  detectedType,
  message,
}) {
  return {
    outputPath,
    outputExtension,
    sourceName,
    outputName,
    detectedType,
    message,
    mimeType: mime.lookup(outputExtension) || "application/octet-stream",
  };
}

export async function ensureOutputExists(outputPath) {
  if (!(await fs.pathExists(outputPath))) {
    throw new AppError("Processing failed", "PROCESSING_FAILED", 500, {
      reason: "Processor did not create an output file",
    });
  }
}
