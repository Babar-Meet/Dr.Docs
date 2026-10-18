// Stamps the page number (1, 2, 3) on every page of a PDF in one of nine
// positions. The stamp is plain dark gray text in the built-in Helvetica
// font, so no font file ships and settings stay predictable. An encrypted
// input is never bypassed and a damaged file must fail with FILE_CORRUPTED,
// exactly like the watermark tool. The input file is only read, the output
// is a fresh file.

import fs from "fs-extra";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { AppError } from "../errors.js";
import { SECURE_ENCRYPTION_MESSAGE } from "../constants.js";

export const PAGE_NUMBER_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

const MARGIN = 24;
const FONT_SIZE = 11;

function toReason(error) {
  return error?.message || "Unknown PDF processing error";
}

function isPasswordError(reason) {
  return /(password|encrypted|decrypt)/i.test(reason || "");
}

function invalid(reason) {
  return new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, { reason });
}

function parsePageNumberPosition(raw) {
  const normalized = String(raw ?? "").trim();
  if (!PAGE_NUMBER_POSITIONS.includes(normalized)) {
    throw invalid(
      `Invalid page number position: ${normalized || "(empty)"}. Supported positions are ${PAGE_NUMBER_POSITIONS.join(", ")}.`,
    );
  }
  return normalized;
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

function drawNumber(page, { font, pageNumber, position }) {
  const { width, height } = page.getSize();
  const label = String(pageNumber);
  const textWidth = font.widthOfTextAtSize(label, FONT_SIZE);

  let x;
  let y;
  if (position.endsWith("left")) {
    x = MARGIN;
  } else if (position.endsWith("right")) {
    x = width - MARGIN - textWidth;
  } else {
    x = (width - textWidth) / 2;
  }

  if (position.startsWith("top")) {
    y = height - MARGIN - FONT_SIZE;
  } else if (position.startsWith("middle")) {
    y = (height - FONT_SIZE) / 2;
  } else {
    y = MARGIN;
  }

  page.drawText(label, {
    x,
    y,
    size: FONT_SIZE,
    font,
    color: rgb(0.15, 0.15, 0.15),
    opacity: 1,
  });
}

export async function pageNumberPdf({ inputPath, outputPath, position }) {
  const stampPosition = parsePageNumberPosition(position);

  const pdfDoc = await loadPdfFromPath(inputPath);
  if (pdfDoc.getPageCount() === 0) {
    throw new AppError("File corrupted", "FILE_CORRUPTED", 400, {
      reason: "The PDF has no readable pages.",
    });
  }

  try {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    for (let index = 0; index < pages.length; index += 1) {
      drawNumber(pages[index], {
        font,
        pageNumber: index + 1,
        position: stampPosition,
      });
    }

    const bytes = await pdfDoc.save();
    await fs.writeFile(outputPath, bytes);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
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
