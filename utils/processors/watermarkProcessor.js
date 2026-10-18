// Stamps one line of text on every page of a PDF. The stamp sits centered,
// diagonal (45 degrees) or flat (0 degrees), written with the built-in
// Helvetica font so no font file ships. An encrypted input is never bypassed:
// pdf-lib refuses to open it and the loader maps that failure to
// PASSWORD_REQUIRED 400 with SECURE_ENCRYPTION_MESSAGE, exactly like the
// rotate tool. The input file is only read, the output is a fresh file.

import fs from "fs-extra";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { AppError } from "../errors.js";
import { SECURE_ENCRYPTION_MESSAGE } from "../constants.js";

const WATERMARK_TEXT_LIMIT = 120;

function toReason(error) {
  return error?.message || "Unknown PDF processing error";
}

function isPasswordError(reason) {
  return /(password|encrypted|decrypt)/i.test(reason || "");
}

function invalid(reason) {
  return new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, { reason });
}

function parseWatermarkText(raw) {
  const text = String(raw ?? "")
    .trim()
    .replace(/[\r\n]+/g, " ")
    .trim();

  if (!text) {
    throw invalid("Enter text to watermark the PDF.");
  }
  if (text.length > WATERMARK_TEXT_LIMIT) {
    throw invalid(
      `Watermark text is ${text.length} characters. The limit is ${WATERMARK_TEXT_LIMIT}.`,
    );
  }
  // The built-in Helvetica font writes only the Latin-1 print range, so a
  // character outside it would fail later. Name the rule up front.
  if (/[^\x20-\x7E]/.test(text)) {
    throw invalid(
      "Watermark text supports standard letters, numbers, and punctuation.",
    );
  }
  return text;
}

function parseWatermarkAngle(raw) {
  const normalized = String(raw ?? "").trim();
  if (normalized !== "0" && normalized !== "45") {
    throw invalid(
      `Invalid watermark angle: ${normalized || "(empty)"}. Supported angles are 0 and 45.`,
    );
  }
  return Number.parseInt(normalized, 10);
}

function parseWatermarkOpacity(raw) {
  const normalized = String(raw ?? "").trim();
  const value = Number.parseFloat(normalized);
  if (normalized === "" || Number.isNaN(value) || value <= 0 || value > 1) {
    throw invalid(
      `Invalid watermark opacity: ${normalized || "(empty)"}. Use a number between 0 and 1.`,
    );
  }
  return value;
}

async function loadPdfFromPath(inputPath) {
  try {
    const pdfBuffer = await fs.readFile(inputPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    // A damaged file can pass load with no page tree and explode later when
    // it is used. Touch the count here so the corruption surfaces at the
    // load boundary, where the error mapping lives.
    pdfDoc.getPageCount();
    return pdfDoc;
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

function clampSize(size) {
  return Math.min(200, Math.max(8, size));
}

// One stamp size per document: the value scales with the page then is clamped,
// so every page is covered by the same rule. The diagonal needs a tighter
// clamp because the rotated stamp is longer than the text itself.
function stampSize({ pageWidth, pageHeight, unitWidth, angle }) {
  if (angle === 45) {
    const rotatedHalf = Math.SQRT1_2;
    const byWidth = (pageWidth * 0.9) / (rotatedHalf * (unitWidth + 1));
    const byHeight = (pageHeight * 0.9) / (rotatedHalf * (unitWidth + 1));
    return clampSize(Math.min(byWidth, byHeight));
  }

  const byWidth = (pageWidth * 0.72) / Math.max(unitWidth, 0.001);
  return clampSize(Math.min(byWidth, pageHeight * 0.4));
}

function drawStamp(page, { font, text, angle, opacity }) {
  const { width, height } = page.getSize();
  const unitWidth = font.widthOfTextAtSize(text, 1);
  const size = stampSize({ pageWidth: width, pageHeight: height, unitWidth, angle });
  const textWidth = unitWidth * size;

  // Place the middle of the stamp at the middle of the page. The middle of the
  // glyphs sits about a third of the size above the baseline, so pull the
  // start point down by that much along the direction the text runs.
  let x;
  let y;
  if (angle === 45) {
    const rotatedHalf = Math.SQRT1_2;
    const baseline = (textWidth / 2) * rotatedHalf;
    const ascent = (size * 0.35) * rotatedHalf;
    x = width / 2 - baseline + ascent;
    y = height / 2 - baseline - ascent;
  } else {
    x = (width - textWidth) / 2;
    y = height / 2 - size * 0.35;
  }

  page.drawText(text, {
    x,
    y,
    size,
    font,
    color: rgb(0.55, 0.55, 0.55),
    opacity,
    rotate: degrees(angle),
  });
}

export async function watermarkPdf({
  inputPath,
  outputPath,
  text,
  angle,
  opacity,
}) {
  const stampText = parseWatermarkText(text);
  const stampAngle = parseWatermarkAngle(angle);
  const stampOpacity = parseWatermarkOpacity(opacity);

  const pdfDoc = await loadPdfFromPath(inputPath);
  if (pdfDoc.getPageCount() === 0) {
    throw new AppError("File corrupted", "FILE_CORRUPTED", 400, {
      reason: "The PDF has no readable pages.",
    });
  }

  try {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    for (const page of pdfDoc.getPages()) {
      drawStamp(page, { font, text: stampText, angle: stampAngle, opacity: stampOpacity });
    }

    const bytes = await pdfDoc.save();
    await fs.writeFile(outputPath, bytes);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    // A damaged file can pass the load and still explode later inside pdf-lib,
    // often with a plain TypeError. Keep the input garbage behind the same
    // contract instead of letting it escape as a crash.
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
