// Operation registry: one entry per shipped operation. Every handler has the
// same shape: async ({ options, files, runtime }) => ({ message, outputs }).
//   options - the request option bag (targetFormat, password, watermark*, ...)
//   files   - the detected input list, [path, originalName, mimeType]
//   runtime - { outputBasePath, workDir, qpdfBin, libreOfficeBin }
// A new operation lands as one handler in this file plus one registry line;
// processService stays unchanged, and router.js and files.js only gain lines
// when the operation carries a new option field. The per-operation flow
// itself lives only here.
import path from "node:path";
import fs from "fs-extra";
import {
  repairOfficeDocument,
  unlockDocxRestrictions,
  unlockPptxRestrictions,
} from "./officeProcessor.js";
import { repairXlsx, unlockXlsxSheetProtection } from "./excelProcessor.js";
import {
  convertImageToFormat,
  convertImageToPdf,
  repairImage,
} from "./imageProcessor.js";
import { normalizeZip, repairZip } from "./zipProcessor.js";
import { convertPdfToImages } from "./rasterProcessor.js";
import {
  convertWithInlineTextExtractors,
  convertWithLibreOffice,
  PDF_INTO_WRITER_INFILTER,
  sofficeInfilterForConvert,
  usesInlineTextExtractors,
} from "./conversionProcessor.js";
import {
  compressPdf,
  protectPdf,
  repairPdf,
  unlockPdfRestrictions,
} from "./pdfProcessor.js";
import { mergePdfFiles, splitPdfByRanges } from "./mergeSplitProcessor.js";
import { runOcrExtraction } from "./ocrProcessor.js";
import { rotatePdfPages } from "./rotateProcessor.js";
import { watermarkPdf } from "./watermarkProcessor.js";
import { pageNumberPdf } from "./pageNumbersProcessor.js";
import {
  createDescriptor,
  createOutputPath,
  createPerFileOutputBase,
  ensureOutputExists,
  sanitizeBaseName,
  unsupportedFile,
} from "./descriptors.js";
import {
  detectFileType,
  isValidConversion,
  normalizeTargetFormat,
} from "../helpers/fileType.js";

// ---------------------------------------------------------------------------
// Handlers for the operations that keep the input's own type (unlock, repair)
// ---------------------------------------------------------------------------

async function unlockByType({ fileType, inputPath, outputPath, qpdfBin, password }) {
  if (fileType.extension === ".pdf") {
    await unlockPdfRestrictions({ inputPath, outputPath, qpdfBin, password });
    return "Restrictions removed from PDF.";
  }

  if (fileType.extension === ".docx") {
    await unlockDocxRestrictions({ inputPath, outputPath });
    return "Editing restrictions removed from DOCX.";
  }

  if (fileType.extension === ".pptx") {
    await unlockPptxRestrictions({ inputPath, outputPath });
    return "Editing restrictions removed from PPTX.";
  }

  if (fileType.extension === ".xlsx") {
    await unlockXlsxSheetProtection({ inputPath, outputPath });
    return "Sheet protection removed from XLSX where possible.";
  }

  if (fileType.extension === ".zip") {
    await normalizeZip({ inputPath, outputPath });
    return "ZIP validated and rebuilt successfully.";
  }

  throw unsupportedFile("Unlock supports PDF, DOCX, PPTX, XLSX, and ZIP.");
}

async function repairByType({ fileType, inputPath, outputPath, qpdfBin }) {
  if (fileType.extension === ".pdf") {
    await repairPdf({ inputPath, outputPath, qpdfBin });
    return "PDF rebuilt and linearized.";
  }

  if (fileType.extension === ".docx" || fileType.extension === ".pptx") {
    await repairOfficeDocument({
      inputPath,
      outputPath,
      extension: fileType.extension,
    });
    return `${fileType.extension.slice(1).toUpperCase()} package validated and rewritten.`;
  }

  if (fileType.extension === ".xlsx") {
    await repairXlsx({ inputPath, outputPath });
    return "XLSX workbook reloaded and rewritten.";
  }

  if (fileType.extension === ".zip") {
    await repairZip({ inputPath, outputPath });
    return "ZIP validated and rebuilt successfully.";
  }

  if (fileType.kind === "image") {
    await repairImage({ inputPath, outputPath });
    return "Image decoded and re-encoded.";
  }

  throw unsupportedFile(
    "Repair supports PDF, DOCX, PPTX, XLSX, ZIP, JPG, and PNG.",
  );
}

// Shared loop for the operations whose output keeps the source extension:
// one detected input in, one descriptor out, message comes from the operate
// callback. The callback owns only the per-call processor invocation.
async function runKeepExtensionFiles({ files, options, runtime, operate }) {
  const outputs = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const fileType = detectFileType(file.originalName, file.mimeType);
    if (!fileType) {
      throw unsupportedFile(`Unsupported file: ${file.originalName}`);
    }

    const perFileBase = createPerFileOutputBase(
      runtime.outputBasePath,
      index,
      file.originalName,
    );
    const outputExtension = fileType.extension;
    const outputPath = createOutputPath(perFileBase, outputExtension);
    const message = await operate({
      fileType,
      inputPath: file.path,
      outputPath,
      options,
      runtime,
    });
    await ensureOutputExists(outputPath);

    outputs.push(
      createDescriptor({
        outputPath,
        outputExtension,
        sourceName: file.originalName,
        detectedType: fileType.extension.slice(1).toUpperCase(),
        message,
      }),
    );
  }
  return { message: `Processed ${outputs.length} file(s) successfully.`, outputs };
}

async function runUnlock({ options, files, runtime }) {
  return runKeepExtensionFiles({
    files,
    runtime,
    operate: async ({ fileType, inputPath, outputPath }) =>
      unlockByType({ fileType, inputPath, outputPath, qpdfBin: runtime.qpdfBin, password: options.password }),
  });
}

async function runRepair({ options, files, runtime }) {
  return runKeepExtensionFiles({
    files,
    runtime,
    operate: async ({ fileType, inputPath, outputPath }) =>
      repairByType({ fileType, inputPath, outputPath, qpdfBin: runtime.qpdfBin }),
  });
}

// ---------------------------------------------------------------------------
// Convert handler
// ---------------------------------------------------------------------------

async function convertByType({
  fileType,
  inputPath,
  outputPath,
  targetFormat,
  libreOfficeBin,
}) {
  if (!isValidConversion(fileType.extension, targetFormat)) {
    throw unsupportedFile("Unsupported conversion pair for this file type");
  }

  if (fileType.kind === "image") {
    if (targetFormat === "pdf") {
      await convertImageToPdf({ inputPath, outputPath });
      return "Image converted to PDF.";
    }

    await convertImageToFormat({ inputPath, outputPath, targetFormat });
    return `Image converted to ${targetFormat.toUpperCase()}.`;
  }

  // Gate entry point: LibreOffice has no plain-text export filter for the
  // Draw, Impress and Calc documents it builds from .pdf, .pptx and .xlsx,
  // so these three declared pairs reuse the extractors the ocr operation
  // runs instead of soffice. See TEXT_FALLBACK_SOURCE_EXTENSIONS in
  // conversionProcessor.js for why the gate is exactly these three pairs.
  // An encrypted PDF still answers PASSWORD_REQUIRED with
  // SECURE_ENCRYPTION_MESSAGE because the pdf-parse check runs first.
  if (
    usesInlineTextExtractors({
      sourceExtension: fileType.extension,
      targetFormat,
    })
  ) {
    await convertWithInlineTextExtractors({
      inputPath,
      sourceExtension: fileType.extension,
      outputPath,
    });
    return "File converted successfully.";
  }
  // A .pdf source imports as a Draw document by default, and a Draw model
  // cannot be stored through the docx, odt, rtf or pptx export filters, so
  // sofficeInfilterForConvert picks the import filter that loads the same
  // file into the module that owns the target's export filter
  // (writer_pdf_import for docx/odt/rtf, impress_pdf_import for pptx). For
  // every other source and target it returns null, which keeps the plain
  // soffice call those pairs have always used. Encrypted PDFs fail the
  // soffice load itself ("source file could not be loaded"), so strong
  // encryption is never bypassed here.
  await convertWithLibreOffice({
    inputPath,
    targetFormat,
    outputPath,
    libreOfficeBin,
    infilter: sofficeInfilterForConvert({
      sourceExtension: fileType.extension,
      targetFormat,
    }),
  });

  return "File converted successfully.";
}

async function runConvert({ options, files, runtime }) {
  const outputs = [];
  // The raster pair is the only convert route that turns one file into
  // several outputs, so it shapes the summary sentence like split does;
  // every other route keeps the generic count below.
  let rasterMessage = null;
  let rasterPages = 0;

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const fileType = detectFileType(file.originalName, file.mimeType);
    if (!fileType) {
      throw unsupportedFile(`Unsupported file: ${file.originalName}`);
    }

    // Kept inside the loop on purpose: the frozen boundary reports an
    // undetectable file before a missing target format for that file.
    const normalizedTarget = normalizeTargetFormat(options.targetFormat);
    if (!normalizedTarget) {
      throw unsupportedFile("A target format is required for convert mode.");
    }

    const perFileBase = createPerFileOutputBase(
      runtime.outputBasePath,
      index,
      file.originalName,
    );

    // PDF -> JPG and PDF -> PNG export one image per page, so this pair
    // can produce several outputs from a single input file. Every other
    // pair still produces exactly one output below.
    if (
      fileType.extension === ".pdf" &&
      (normalizedTarget === "jpg" || normalizedTarget === "png")
    ) {
      if (!isValidConversion(fileType.extension, normalizedTarget)) {
        throw unsupportedFile(
          "Unsupported conversion pair for this file type",
        );
      }

      const outputDir = path.dirname(runtime.outputBasePath);
      const imageOutputs = await convertPdfToImages({
        inputPath: file.path,
        outputDir,
        outputPrefix: sanitizeBaseName(
          path.parse(file.originalName).name,
        ),
        targetFormat: normalizedTarget,
      });

      for (const [imageIndex, part] of imageOutputs.entries()) {
        await ensureOutputExists(part.outputPath);
        outputs.push(
          createDescriptor({
            outputPath: part.outputPath,
            outputExtension: `.${normalizedTarget}`,
            sourceName: path.parse(part.outputName).name,
            outputName: part.outputName,
            detectedType: normalizedTarget.toUpperCase(),
            message: `Page ${imageIndex + 1} exported as ${normalizedTarget.toUpperCase()}.`,
          }),
        );
      }
      rasterPages += imageOutputs.length;
      rasterMessage = `Exported ${rasterPages} page(s) as ${normalizedTarget.toUpperCase()} images.`;
      continue;
    }

    const outputExtension = `.${normalizedTarget}`;
    const outputPath = createOutputPath(perFileBase, outputExtension);
    const message = await convertByType({
      fileType,
      inputPath: file.path,
      outputPath,
      targetFormat: normalizedTarget,
      libreOfficeBin: runtime.libreOfficeBin,
    });
    await ensureOutputExists(outputPath);

    outputs.push(
      createDescriptor({
        outputPath,
        outputExtension,
        sourceName: file.originalName,
        detectedType: outputExtension.slice(1).toUpperCase(),
        message,
      }),
    );
  }

  return {
    message: rasterMessage || `Processed ${outputs.length} file(s) successfully.`,
    outputs,
  };
}

// ---------------------------------------------------------------------------
// Merge handler
// ---------------------------------------------------------------------------

async function toPdfForMerge({ file, index, workDir, libreOfficeBin }) {
  const fileType = detectFileType(file.originalName, file.mimeType);
  if (!fileType) {
    throw unsupportedFile(`Unsupported merge input: ${file.originalName}`);
  }

  if (fileType.extension === ".zip") {
    throw unsupportedFile("ZIP files are not supported for merge.");
  }

  const tempPdfPath = path.join(workDir, `merge_input_${index + 1}.pdf`);

  if (fileType.extension === ".pdf") {
    await fs.copy(file.path, tempPdfPath, { overwrite: true });
    return tempPdfPath;
  }

  if (fileType.kind === "image") {
    await convertImageToPdf({ inputPath: file.path, outputPath: tempPdfPath });
    return tempPdfPath;
  }

  await convertWithLibreOffice({
    inputPath: file.path,
    targetFormat: "pdf",
    outputPath: tempPdfPath,
    libreOfficeBin,
  });

  return tempPdfPath;
}

async function runMerge({ options, files, runtime }) {
  if (!Array.isArray(files) || files.length < 2) {
    throw unsupportedFile("Merge requires at least two files.");
  }

  const mergeTarget = normalizeTargetFormat(options.targetFormat) || "pdf";
  if (!["pdf", "docx"].includes(mergeTarget)) {
    throw unsupportedFile("Merge output format must be PDF or DOCX.");
  }

  const outputExtension = mergeTarget === "docx" ? ".docx" : ".pdf";
  const outputPath = createOutputPath(runtime.outputBasePath, outputExtension);

  const convertedPdfInputs = [];
  for (let index = 0; index < files.length; index += 1) {
    const pdfPath = await toPdfForMerge({
      file: files[index],
      index,
      workDir: runtime.workDir,
      libreOfficeBin: runtime.libreOfficeBin,
    });
    convertedPdfInputs.push({ path: pdfPath });
  }

  const mergedPdfPath = path.join(runtime.workDir, "merged_result.pdf");
  await mergePdfFiles({
    inputFiles: convertedPdfInputs,
    outputPath: mergedPdfPath,
  });

  let message;
  if (mergeTarget === "pdf") {
    await fs.copy(mergedPdfPath, outputPath, { overwrite: true });
    message = "Files merged into one PDF successfully.";
  } else {
    // LibreOffice imports a PDF as a Draw document by default and Draw cannot
    // be exported as DOCX ("Error: no export filter"), so this step passes
    // PDF_INTO_WRITER_INFILTER to load the merged PDF into a Writer document,
    // from which the docx export filter works. The merged PDF is produced by
    // pdf-lib and inputs that are encrypted fail earlier in this flow with
    // PASSWORD_REQUIRED, so no encryption is bypassed here.
    await convertWithLibreOffice({
      inputPath: mergedPdfPath,
      targetFormat: "docx",
      outputPath,
      libreOfficeBin: runtime.libreOfficeBin,
      infilter: PDF_INTO_WRITER_INFILTER,
    });
    message = "Files merged and exported as DOCX successfully.";
  }

  await ensureOutputExists(outputPath);
  return {
    message,
    outputs: [
      createDescriptor({
        outputPath,
        outputExtension,
        sourceName: "merged_files",
        outputName: `merged_files_processed${outputExtension}`,
        detectedType: outputExtension.slice(1).toUpperCase(),
        message,
      }),
    ],
  };
}

// ---------------------------------------------------------------------------
// Straight-line PDF handlers: compress, protect, watermark, page numbers
// ---------------------------------------------------------------------------

// One shared loop for the four operations that take any number of PDFs and
// write exactly one transformed PDF per input. The per-operation config is
// fixed data by design: suffix and messages are frozen behavior.
async function runPerPdfFiles({
  files,
  options,
  runtime,
  onlyPdfMessage,
  outputSuffix,
  perFileMessage,
  summary,
  invokeProcessor,
}) {
  const outputs = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const fileType = detectFileType(file.originalName, file.mimeType);
    if (!fileType || fileType.extension !== ".pdf") {
      throw unsupportedFile(onlyPdfMessage);
    }
    const perFileBase = createPerFileOutputBase(
      runtime.outputBasePath,
      index,
      file.originalName,
    );
    const outputPath = createOutputPath(perFileBase, ".pdf");
    await invokeProcessor({ inputPath: file.path, outputPath, options, runtime });
    await ensureOutputExists(outputPath);
    const base = sanitizeBaseName(path.parse(file.originalName).name);
    outputs.push(
      createDescriptor({
        outputPath,
        outputExtension: ".pdf",
        sourceName: file.originalName,
        outputName: `${base}${outputSuffix}`,
        detectedType: "PDF",
        message: perFileMessage,
      }),
    );
  }
  return {
    message: summary(outputs.length),
    outputs,
  };
}

async function runCompress({ options, files, runtime }) {
  return runPerPdfFiles({
    files,
    runtime,
    onlyPdfMessage: "Compress supports PDF files only.",
    outputSuffix: "_compressed.pdf",
    perFileMessage: "PDF optimized (lossless) successfully.",
    summary: (count) => `Compressed ${count} PDF(s) (lossless optimize).`,
    invokeProcessor: async ({ inputPath, outputPath }) =>
      compressPdf({ inputPath, outputPath, qpdfBin: runtime.qpdfBin }),
  });
}

async function runProtect({ options, files, runtime }) {
  const protectedPassword = String(options.password || "");
  if (!protectedPassword.trim()) {
    throw unsupportedFile("Enter a password to protect the PDF.");
  }
  return runPerPdfFiles({
    files,
    runtime,
    onlyPdfMessage: "Protect supports PDF files only.",
    outputSuffix: "_protected.pdf",
    perFileMessage: "PDF password protected successfully.",
    summary: (count) => `Protected ${count} PDF(s) with a password.`,
    invokeProcessor: async ({ inputPath, outputPath }) =>
      protectPdf({ inputPath, outputPath, password: protectedPassword, qpdfBin: runtime.qpdfBin }),
  });
}

async function runWatermark({ options, files, runtime }) {
  return runPerPdfFiles({
    files,
    runtime,
    onlyPdfMessage: "Watermark supports PDF files only.",
    outputSuffix: "_watermark.pdf",
    perFileMessage: "PDF watermarked successfully.",
    summary: (count) => `Watermarked ${count} PDF(s).`,
    invokeProcessor: async ({ inputPath, outputPath }) =>
      watermarkPdf({
        inputPath,
        outputPath,
        text: options.watermarkText,
        angle: options.watermarkAngle,
        opacity: options.watermarkOpacity,
        type: options.watermarkType,
      }),
  });
}

async function runPageNumbers({ options, files, runtime }) {
  return runPerPdfFiles({
    files,
    runtime,
    onlyPdfMessage: "Page numbers supports PDF files only.",
    outputSuffix: "_numbered.pdf",
    perFileMessage: "Page numbers added successfully.",
    summary: (count) => `Numbered ${count} PDF(s).`,
    invokeProcessor: async ({ inputPath, outputPath }) =>
      pageNumberPdf({
        inputPath,
        outputPath,
        position: options.pageNumberPosition,
        margin: options.pageNumberMargin,
      }),
  });
}

// ---------------------------------------------------------------------------
// Single-PDF handlers: split, rotate, ocr
// ---------------------------------------------------------------------------

async function runSplit({ options, files, runtime }) {
  if (files.length !== 1) {
    throw unsupportedFile("Split requires exactly one PDF file.");
  }

  const file = files[0];
  const fileType = detectFileType(file.originalName, file.mimeType);
  if (!fileType || fileType.extension !== ".pdf") {
    throw unsupportedFile("Split supports PDF files only.");
  }

  const outputDir = path.dirname(runtime.outputBasePath);
  const outputPrefix = sanitizeBaseName(path.parse(file.originalName).name);
  const splitOutputs = await splitPdfByRanges({
    inputPath: file.path,
    outputDir,
    outputPrefix,
    pageRanges: options.pageRanges,
    splitEvery: options.splitEvery,
  });

  const outputs = [];
  for (const part of splitOutputs) {
    await ensureOutputExists(part.outputPath);
    outputs.push(
      createDescriptor({
        outputPath: part.outputPath,
        outputExtension: ".pdf",
        sourceName: path.parse(part.outputName).name,
        outputName: part.outputName,
        detectedType: "PDF",
        message: "Split part generated.",
      }),
    );
  }

  return {
    message: `Split completed with ${outputs.length} output file(s).`,
    outputs,
  };
}

async function runRotate({ options, files, runtime }) {
  if (files.length !== 1) {
    throw unsupportedFile("Rotate requires exactly one PDF file.");
  }

  const file = files[0];
  const fileType = detectFileType(file.originalName, file.mimeType);
  if (!fileType || fileType.extension !== ".pdf") {
    throw unsupportedFile("Rotate supports PDF files only.");
  }

  const perFileBase = createPerFileOutputBase(
    runtime.outputBasePath,
    0,
    file.originalName,
  );
  const outputPath = createOutputPath(perFileBase, ".pdf");
  await rotatePdfPages({
    inputPath: file.path,
    outputPath,
    rotationAngle: options.rotationAngle,
    pages: options.pages,
    rotations: options.rotations,
  });
  await ensureOutputExists(outputPath);

  return {
    message: "PDF rotated successfully.",
    outputs: [
      createDescriptor({
        outputPath,
        outputExtension: ".pdf",
        sourceName: file.originalName,
        outputName: `${sanitizeBaseName(path.parse(file.originalName).name)}_rotated.pdf`,
        detectedType: "PDF",
        message: "PDF rotated successfully.",
      }),
    ],
  };
}

async function runOcr({ files, runtime }) {
  const outputs = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const fileType = detectFileType(file.originalName, file.mimeType);
    if (!fileType) {
      throw unsupportedFile(`Unsupported file: ${file.originalName}`);
    }

    const perFileBase = createPerFileOutputBase(
      runtime.outputBasePath,
      index,
      file.originalName,
    );
    const outputExtension = ".txt";
    const outputPath = createOutputPath(perFileBase, outputExtension);
    const message = await runOcrExtraction({
      inputPath: file.path,
      extension: fileType.extension,
      outputPath,
    });
    await ensureOutputExists(outputPath);

    outputs.push(
      createDescriptor({
        outputPath,
        outputExtension,
        sourceName: file.originalName,
        detectedType: "TXT",
        message: "OCR/text extraction completed.",
      }),
    );
  }

  return {
    message: `Processed ${outputs.length} file(s) successfully.`,
    outputs,
  };
}

// The registry: one line per shipped operation. OPERATION_MODES in
// constants.js declares the accepted modes; every declared mode must have a
// handler here.
export const OPERATION_HANDLERS = {
  unlock: runUnlock,
  convert: runConvert,
  merge: runMerge,
  split: runSplit,
  ocr: runOcr,
  rotate: runRotate,
  compress: runCompress,
  repair: runRepair,
  protect: runProtect,
  watermark: runWatermark,
  pagenumbers: runPageNumbers,
};
