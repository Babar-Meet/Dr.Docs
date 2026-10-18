import path from "node:path";
import fs from "fs-extra";
import { PDFDocument, degrees } from "pdf-lib";
import { AppError } from "../errors.js";
import { SECURE_ENCRYPTION_MESSAGE } from "../constants.js";

function toReason(error) {
  return error?.message || "Unknown PDF processing error";
}

function isPasswordError(reason) {
  return /(password|encrypted|decrypt)/i.test(reason || "");
}

function normalizeRotationAngle(raw) {
  const normalized = String(raw ?? "").trim();
  const angle = Number.parseInt(normalized, 10);
  if (Number.isNaN(angle) || ![90, 180, 270].includes(angle)) {
    throw new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, {
      reason: `Invalid rotation angle: ${raw}. Supported angles are 90, 180, 270.`,
    });
  }
  // Strict check to reject "90abc" which parseInt would accept as 90
  if (String(angle) !== normalized) {
    throw new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, {
      reason: `Invalid rotation angle: ${raw}. Supported angles are 90, 180, 270.`,
    });
  }
  return angle;
}

function parseRotatePages(pagesRaw, pageCount) {
  const raw = (pagesRaw ?? "").trim();
  if (!raw || raw.toLowerCase() === "all") {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const tokens = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pagesSet = new Set();

  for (const segment of tokens) {
    if (segment.includes("-")) {
      const parts = segment.split("-");
      if (parts.length !== 2) {
        throw new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, {
          reason: `Invalid page range: ${segment}`,
        });
      }
      const startRaw = parts[0].trim();
      const endRaw = parts[1].trim();

      if (!/^\d+$/.test(startRaw) || !/^\d+$/.test(endRaw)) {
        throw new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, {
          reason: `Invalid page range: ${segment}`,
        });
      }

      const start = Number.parseInt(startRaw, 10);
      const end = Number.parseInt(endRaw, 10);

      if (
        Number.isNaN(start) ||
        Number.isNaN(end) ||
        start < 1 ||
        end < 1 ||
        end < start ||
        start > pageCount ||
        end > pageCount
      ) {
        throw new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, {
          reason: `Invalid page range: ${segment}`,
        });
      }

      for (let p = start; p <= end; p += 1) {
        pagesSet.add(p);
      }
    } else {
      if (!/^\d+$/.test(segment)) {
        throw new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, {
          reason: `Invalid page number: ${segment}`,
        });
      }
      const pageNumber = Number.parseInt(segment, 10);
      if (
        Number.isNaN(pageNumber) ||
        pageNumber < 1 ||
        pageNumber > pageCount
      ) {
        throw new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, {
          reason: `Invalid page number: ${segment}`,
        });
      }
      pagesSet.add(pageNumber);
    }
  }

  const sorted = Array.from(pagesSet).sort((a, b) => a - b);
  if (sorted.length === 0) {
    throw new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, {
      reason: `Invalid page range: ${raw}`,
    });
  }
  return sorted;
}

// Per-page rotations come as page:angle pairs like "1:90,3:270". Each entry is
// a clockwise delta applied to that page only. Absent pages keep their
// rotation. Returns null for an empty field so the caller falls back to the
// original angle plus pages path.
function parseRotations(rotationsRaw, pageCount) {
  const raw = (rotationsRaw ?? "").trim();
  if (!raw) return null;

  const tokens = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) return null;

  const byPage = new Map();
  for (const token of tokens) {
    if (!/^\d+:\d+$/.test(token)) {
      throw new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, {
        reason: `Invalid rotation entry: ${token}. Use page:angle pairs like 1:90.`,
      });
    }
    const separatorIndex = token.indexOf(":");
    const pageRaw = token.slice(0, separatorIndex);
    const angleRaw = token.slice(separatorIndex + 1);
    const pageNumber = Number.parseInt(pageRaw, 10);
    const angle = Number.parseInt(angleRaw, 10);

    if (Number.isNaN(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
      throw new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, {
        reason: `Invalid rotation entry: ${token}. Page ${pageRaw} is past the last page (${pageCount} pages).`,
      });
    }
    if (Number.isNaN(angle) || ![90, 180, 270].includes(angle)) {
      throw new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, {
        reason: `Invalid rotation entry: ${token}. Supported angles are 90, 180, 270.`,
      });
    }
    if (byPage.has(pageNumber)) {
      throw new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, {
        reason: `Invalid rotation entry: page ${pageNumber} is listed more than once.`,
      });
    }
    byPage.set(pageNumber, angle);
  }

  if (byPage.size === 0) {
    throw new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, {
      reason: `Invalid rotation entry: ${raw}`,
    });
  }
  return byPage;
}

async function loadPdfFromPath(inputPath) {
  try {
    const pdfBuffer = await fs.readFile(inputPath);
    return await PDFDocument.load(pdfBuffer);
  } catch (error) {
    const reason = toReason(error);
    if (isPasswordError(reason)) {
      throw new AppError(SECURE_ENCRYPTION_MESSAGE, "PASSWORD_REQUIRED", 400, {
        reason: "Password required",
      });
    }

    throw new AppError("File corrupted", "FILE_CORRUPTED", 400, {
      reason,
    });
  }
}

export async function rotatePdfPages({
  inputPath,
  outputPath,
  rotationAngle,
  pages,
  rotations,
}) {
  // The per-page rotations field is an additive extension. When it is absent
  // the original single angle plus pages list path runs exactly as before.
  const hasRotations = String(rotations ?? "").trim().length > 0;
  const normalizedAngle = hasRotations ? null : normalizeRotationAngle(rotationAngle);
  const pdfDoc = await loadPdfFromPath(inputPath);
  const pageCount = pdfDoc.getPageCount();

  if (pageCount === 0) {
    throw new AppError("File corrupted", "FILE_CORRUPTED", 400, {
      reason: "PDF has no pages",
    });
  }

  const pdfPages = pdfDoc.getPages();

  if (hasRotations) {
    const rotationMap = parseRotations(rotations, pageCount);
    for (let index = 0; index < pdfPages.length; index += 1) {
      const pageNumber = index + 1;
      if (!rotationMap.has(pageNumber)) {
        continue;
      }
      const page = pdfPages[index];
      const currentRotation = page.getRotation().angle;
      const newAngle = (currentRotation + rotationMap.get(pageNumber)) % 360;
      page.setRotation(degrees(newAngle));
    }
    await fs.ensureDir(path.dirname(outputPath));
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(outputPath, pdfBytes);
    return;
  }

  const pagesToRotate = parseRotatePages(pages, pageCount);
  const pagesToRotateSet = new Set(pagesToRotate);

  for (let index = 0; index < pdfPages.length; index += 1) {
    const pageNumber = index + 1;
    if (!pagesToRotateSet.has(pageNumber)) {
      continue;
    }
    const page = pdfPages[index];
    const currentRotation = page.getRotation().angle;
    const newAngle = (currentRotation + normalizedAngle) % 360;
    page.setRotation(degrees(newAngle));
  }

  await fs.ensureDir(path.dirname(outputPath));
  const pdfBytes = await pdfDoc.save();
  await fs.writeFile(outputPath, pdfBytes);
}
