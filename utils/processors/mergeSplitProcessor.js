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

// Exported for the split-parts tests: the client's parts editor parses the
// same pageRanges string and this is the rule it must agree with.
export function normalizePageRanges(pageRanges, pageCount) {
  if (!pageRanges || !pageRanges.trim()) {
    return Array.from({ length: pageCount }, (_, index) => [
      index + 1,
      index + 1,
    ]);
  }

  return pageRanges
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((segment) => {
      if (segment.includes("-")) {
        const [startRaw, endRaw] = segment.split("-");
        const start = Number.parseInt(startRaw, 10);
        const end = Number.parseInt(endRaw, 10);

        if (
          Number.isNaN(start) ||
          Number.isNaN(end) ||
          start < 1 ||
          end < start ||
          end > pageCount
        ) {
          throw new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, {
            reason: `Invalid page range: ${segment}`,
          });
        }

        return [start, end];
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

      return [pageNumber, pageNumber];
    });
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

export async function mergePdfFiles({ inputFiles, outputPath }) {
  if (!Array.isArray(inputFiles) || inputFiles.length < 2) {
    throw new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, {
      reason: "Merge requires at least two PDF files",
    });
  }

  const mergedDocument = await PDFDocument.create();

  for (const file of inputFiles) {
    const currentPdf = await loadPdfFromPath(file.path);
    const pages = await mergedDocument.copyPages(
      currentPdf,
      currentPdf.getPageIndices(),
    );
    for (const page of pages) {
      mergedDocument.addPage(page);
    }
  }

  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, await mergedDocument.save());
}

export async function splitPdfByRanges({
  inputPath,
  outputDir,
  outputPrefix,
  pageRanges,
}) {
  const inputPdf = await loadPdfFromPath(inputPath);
  const pageCount = inputPdf.getPageCount();
  const segments = normalizePageRanges(pageRanges, pageCount);

  await fs.ensureDir(outputDir);

  const outputs = [];

  for (let index = 0; index < segments.length; index += 1) {
    const [startPage, endPage] = segments[index];
    const splitDoc = await PDFDocument.create();
    const pageIndexes = [];

    for (let page = startPage; page <= endPage; page += 1) {
      pageIndexes.push(page - 1);
    }

    const copiedPages = await splitDoc.copyPages(inputPdf, pageIndexes);
    copiedPages.forEach((page) => splitDoc.addPage(page));

    const splitBuffer = await splitDoc.save();
    const fileName =
      startPage === endPage
        ? `page_${startPage}.pdf`
        : `pages_${startPage}-${endPage}.pdf`;

    const outputName = `${outputPrefix}_part_${index + 1}_${fileName}`;
    const outputPath = path.join(outputDir, outputName);
    await fs.writeFile(outputPath, splitBuffer);

    outputs.push({
      outputPath,
      outputName,
      outputExtension: ".pdf",
    });
  }

  return outputs;
}
