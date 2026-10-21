// Organize copies the source PDF's pages onto a fresh document in the order
// the request names. The wire field organizePages carries comma-separated
// ORIGINAL page numbers in OUTPUT order: repetition duplicates a page,
// omission removes it, and every page stays at its own size and rotation.
// An empty field is refused with the same plain-English reason the client
// strip shows. An encrypted input is never bypassed and a damaged file must
// fail with FILE_CORRUPTED, exactly like the rotate tool. The input file is
// only read; the output is a fresh file.

import path from "node:path";
import fs from "fs-extra";
import { PDFDocument } from "pdf-lib";
import { AppError } from "../errors.js";
import { SECURE_ENCRYPTION_MESSAGE } from "../constants.js";

function toReason(error) {
  return error?.message || "Unknown PDF processing error";
}

function isPasswordError(reason) {
  return /(password|encrypted|decrypt)/i.test(reason || "");
}

function invalid(reason) {
  return new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, { reason });
}

// Exported for the organize strip tests: client/src/lib/organizeOrder.js
// parses the same organizePages string and this is the rule it must agree
// with. Tokens are trimmed and empty tokens are dropped; every remaining
// token must be pure digits within 1..pageCount. The first bad token refuses
// with its own message.
export function parseOrganizeOrder(organizePages, pageCount) {
  const raw = String(organizePages ?? "").trim();
  if (!raw) {
    throw invalid("Choose how to arrange the pages before organizing.");
  }

  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw invalid("Choose how to arrange the pages before organizing.");
  }

  const entries = [];
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) {
      throw invalid(
        `Invalid page: ${token}. Use page numbers between 1 and ${pageCount}.`,
      );
    }
    const page = Number.parseInt(token, 10);
    if (Number.isNaN(page) || page < 1 || page > pageCount) {
      throw invalid(
        `Invalid page: ${token}. Use page numbers between 1 and ${pageCount}.`,
      );
    }
    entries.push(page);
  }
  return entries;
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

export async function organizePdf({ inputPath, outputPath, organizePages }) {
  const pdfDoc = await loadPdfFromPath(inputPath);
  const pageCount = pdfDoc.getPageCount();

  if (pageCount === 0) {
    throw new AppError("File corrupted", "FILE_CORRUPTED", 400, {
      reason: "PDF has no pages",
    });
  }

  const order = parseOrganizeOrder(organizePages, pageCount);

  // copyPages takes zero-based indices and creates one fresh copy per
  // element, so a repeated index keeps the page twice. No shared page tree
  // objects reach the output: a clone is made for every copied page.
  const outputDoc = await PDFDocument.create();
  const indices = order.map((page) => page - 1);
  const copiedPages = await outputDoc.copyPages(pdfDoc, indices);
  for (const page of copiedPages) {
    outputDoc.addPage(page);
  }

  await fs.ensureDir(path.dirname(outputPath));
  const pdfBytes = await outputDoc.save();
  await fs.writeFile(outputPath, pdfBytes);
}
