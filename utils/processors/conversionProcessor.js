import path from "node:path";
import fs from "fs-extra";
import { createRequire } from "node:module";
import { AppError } from "../errors.js";
import { SECURE_ENCRYPTION_MESSAGE } from "../constants.js";
import { normalizeTargetFormat } from "../helpers/fileType.js";
import { runCommand } from "../helpers/command.js";
import { withLibreOfficeProfile } from "../helpers/libreOfficeProfile.js";
import { runOcrExtraction } from "./ocrProcessor.js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

function parseReason(error) {
  return [error?.stderr, error?.stdout, error?.message]
    .filter(Boolean)
    .join(" ");
}

function toReason(error) {
  return error?.message || "Unknown conversion error";
}

function isPasswordRelated(reason) {
  return /(password|encrypted|decrypt)/i.test(reason || "");
}

function normalizeText(text) {
  return (text || "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Gate entry point for declared conversion pairs this LibreOffice build cannot
// produce through the soffice path. LibreOffice imports .pdf as Draw, .pptx as
// Impress and .xlsx as Calc, and none of those modules exposes a plain-text
// export filter, so "soffice --convert-to txt" answers
// "Error: no export filter ... found" for exactly the extensions below, while
// the same call on a Writer document succeeds ("using filter : Text"). Those
// and only those pairs route through the extractors the ocr operation already
// runs in process instead of soffice: PPTX and XLSX through runOcrExtraction
// (the JSZip a:t parse and ExcelJS), and PDF through pdf-parse with the
// dedicated buffer copy it needs (see below). Every other declared pair,
// including .docx to .txt, keeps the soffice path unchanged.
// Measured runs: Temp/REPORT_deadpairs.md.
const TEXT_FALLBACK_SOURCE_EXTENSIONS = new Set([".pdf", ".pptx", ".xlsx"]);

// Node pools the backing ArrayBuffer of small Buffers (readFile of anything
// below the ~4KB pool cutoff shares one 8KB pool), and pdf-parse's bundled
// pdf.js builds cannot parse such a Buffer: they read stream starts from the
// shared pool instead of the file and answer "Invalid PDF structure", with a
// different garbage byte pair every run. The repo's own ocr tests note this
// ("pdf-parse may fail on pdf-lib generated pdfs") and route around it.
// A dedicated Uint8Array has its own exact ArrayBuffer, so pdf.js parses the
// real bytes. Measured before and after on the repo fixtures and on files
// above the pool cutoff (only the pooled ones failed):
// Temp/REPORT_deadpairs.md. The copy is unconditional because a Buffer can
// always be pooled regardless of size, and the ocr path stays untouched.
const EXTRACTED_TEXT_PLACEHOLDER =
  "No readable text could be extracted from this file.";

export function usesInlineTextExtractors({ sourceExtension, targetFormat }) {
  return (
    normalizeTargetFormat(targetFormat) === "txt" &&
    TEXT_FALLBACK_SOURCE_EXTENSIONS.has(sourceExtension)
  );
}

// Same extraction and boundaries as the ocr extractor for PDF
// (ocrProcessor.js extractPdfText): a password refusal from pdf-parse maps to
// PASSWORD_REQUIRED 400 with SECURE_ENCRYPTION_MESSAGE, never bypassed; a
// non-parseable PDF is FILE_CORRUPTED 400. Empty text becomes the same
// placeholder the ocr operation writes, so every success is a non-empty .txt.
async function extractPdfTextForConvert(inputPath) {
  try {
    const pdfBuffer = await fs.readFile(inputPath);
    const parsed = await pdfParse(new Uint8Array(pdfBuffer));
    return parsed.text || "";
  } catch (error) {
    if (isPasswordRelated(toReason(error))) {
      throw new AppError(SECURE_ENCRYPTION_MESSAGE, "PASSWORD_REQUIRED", 400, {
        reason: "Password required",
      });
    }

    throw new AppError("File corrupted", "FILE_CORRUPTED", 400, {
      reason: toReason(error),
    });
  }
}

export async function convertWithInlineTextExtractors({
  inputPath,
  sourceExtension,
  outputPath,
}) {
  try {
    if (sourceExtension === ".pdf") {
      const extractedText = await extractPdfTextForConvert(inputPath);
      const normalized = normalizeText(extractedText);
      await fs.writeFile(
        outputPath,
        normalized || EXTRACTED_TEXT_PLACEHOLDER,
        "utf8",
      );
      return;
    }

    // PPTX and XLSX reuse the ocr operation's extraction as is, including its
    // catch semantics below.
    await runOcrExtraction({
      inputPath,
      extension: sourceExtension,
      outputPath,
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Processing failed", "PROCESSING_FAILED", 500, {
      reason: toReason(error),
    });
  }
}

// LibreOffice opens a PDF as a Draw document by default, and Draw cannot be
// stored through the Writer docx export filters, so converting a merged PDF
// with "soffice --convert-to docx" fails with "Error: no export filter".
// Passing "writer_pdf_import" as the import filter makes LibreOffice load the
// PDF into a Writer document instead ("... as a Writer document ... using
// filter : Office Open XML Text"), from which the docx export succeeds.
// No other caller passes an infilter, so every pair that works today keeps
// the exact command line it had before.
export const PDF_INTO_WRITER_INFILTER = "writer_pdf_import";

// Same mechanism for the Impress-owning pptx export from a .pdf source.
// share/registry/pdfimport.xcd of this build (LibreOffice 26.2) registers
// exactly three PDF import filters: draw_pdf_import (DrawingDocument),
// impress_pdf_import (PresentationDocument) and writer_pdf_import
// (TextDocument), so these two named overrides cover every PDF import module
// that exists here. With the default Draw import none of docx, odt, rtf or
// pptx could be stored, which is why those four pairs answered
// "Error: no export filter"; measured loads and exports are in
// Temp/REPORT_writerpairs.md. There is no Calc import filter at all
// (calc.xcd registers only calc_pdf_Export, EXPORT flags), so .pdf -> xlsx
// keeps failing, and .docx -> pptx / .pptx -> docx keep failing because a
// Writer model cannot be stored through an Impress filter and vice versa
// ("SfxBaseModel::impl_store ... 0x81a" with a quoted filter spec).
export const PDF_INTO_IMPRESS_INFILTER = "impress_pdf_import";

const PDF_TARGET_INFILTERS = {
  docx: PDF_INTO_WRITER_INFILTER,
  odt: PDF_INTO_WRITER_INFILTER,
  rtf: PDF_INTO_WRITER_INFILTER,
  pptx: PDF_INTO_IMPRESS_INFILTER,
};

// Decides the --infilter argument convertWithLibreOffice opens a source file
// with, per declared convert pair. Only .pdf sources need one, and only for
// the four targets listed above; null keeps the plain soffice call so every
// other pair keeps today's exact command line.
export function sofficeInfilterForConvert({ sourceExtension, targetFormat }) {
  if (sourceExtension !== ".pdf") {
    return null;
  }

  return PDF_TARGET_INFILTERS[normalizeTargetFormat(targetFormat)] || null;
}

export async function convertWithLibreOffice({
  inputPath,
  targetFormat,
  outputPath,
  libreOfficeBin,
  infilter,
}) {
  const normalizedTarget = (targetFormat || "")
    .replace(/^\./, "")
    .toLowerCase();
  const outputDir = path.dirname(outputPath);

  await fs.ensureDir(outputDir);

  try {
    // Each conversion runs with its own LibreOffice user profile, so two conversions
    // started at the same time cannot collide inside one shared profile.
    await withLibreOfficeProfile(({ profileArgs }) =>
      runCommand(
        libreOfficeBin,
        [
          ...profileArgs,
          "--headless",
          // Optional import filter override (see PDF_INTO_WRITER_INFILTER).
          // Absent on every call that worked before this change, so the
          // command line for those pairs is byte-for-byte unchanged.
          ...(infilter ? [`--infilter=${infilter}`] : []),
          "--convert-to",
          normalizedTarget,
          "--outdir",
          outputDir,
          inputPath,
        ],
        { timeoutMs: 240000 },
      ),
    );
  } catch (error) {
    throw new AppError("Processing failed", "PROCESSING_FAILED", 500, {
      reason: parseReason(error) || "LibreOffice conversion failed",
    });
  }

  const expectedOutput = path.join(
    outputDir,
    `${path.parse(inputPath).name}.${normalizedTarget}`,
  );

  if (!(await fs.pathExists(expectedOutput))) {
    throw new AppError("Processing failed", "PROCESSING_FAILED", 500, {
      reason: "LibreOffice did not return a converted file",
    });
  }

  if (expectedOutput !== outputPath) {
    await fs.move(expectedOutput, outputPath, { overwrite: true });
  }
}
