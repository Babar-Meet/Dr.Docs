import path from "node:path";
import fs from "fs-extra";
import mime from "mime-types";
import { AppError } from "../errors.js";
import {
  detectFileType,
  isValidConversion,
  isValidOperation,
  normalizeTargetFormat,
} from "../helpers/fileType.js";
import {
  unlockDocxRestrictions,
  unlockPptxRestrictions,
} from "./officeProcessor.js";
import { unlockXlsxSheetProtection } from "./excelProcessor.js";
import { convertImageToFormat, convertImageToPdf } from "./imageProcessor.js";
import { normalizeZip } from "./zipProcessor.js";
import { convertWithLibreOffice } from "./conversionProcessor.js";
import {
  compressPdf,
  unlockPdfRestrictions,
} from "./pdfProcessor.js";
import { mergePdfFiles, splitPdfByRanges } from "./mergeSplitProcessor.js";
import { runOcrExtraction } from "./ocrProcessor.js";
import { rotatePdfPages } from "./rotateProcessor.js";

function unsupportedFile(
  reason = "This operation is not available for this file type",
) {
  return new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, { reason });
}

function sanitizeBaseName(name) {
  const raw = (name || "file").trim();
  const safe = raw.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
  return safe || "file";
}

function createOutputPath(outputBasePath, extension) {
  return `${outputBasePath}${extension}`;
}

function createPerFileOutputBase(outputBasePath, index, sourceName) {
  const base = sanitizeBaseName(
    path.parse(sourceName || `file_${index + 1}`).name,
  );
  return `${outputBasePath}_${index + 1}_${base}`;
}

function createDescriptor({
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

async function ensureOutputExists(outputPath) {
  if (!(await fs.pathExists(outputPath))) {
    throw new AppError("Processing failed", "PROCESSING_FAILED", 500, {
      reason: "Processor did not create an output file",
    });
  }
}

async function unlockByType({ fileType, inputPath, outputPath, qpdfBin }) {
  if (fileType.extension === ".pdf") {
    await unlockPdfRestrictions({ inputPath, outputPath, qpdfBin });
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

  await convertWithLibreOffice({
    inputPath,
    targetFormat,
    outputPath,
    libreOfficeBin,
  });

  return "File converted successfully.";
}

async function ocrByType({ fileType, inputPath, outputPath }) {
  await runOcrExtraction({
    inputPath,
    extension: fileType.extension,
    outputPath,
  });
  return "OCR/text extraction completed.";
}

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

async function mergeByType({
  inputFiles,
  outputPath,
  mergeTargetFormat,
  workDir,
  libreOfficeBin,
}) {
  if (!Array.isArray(inputFiles) || inputFiles.length < 2) {
    throw unsupportedFile("Merge requires at least two files.");
  }

  const mergeTarget = normalizeTargetFormat(mergeTargetFormat) || "pdf";
  if (!["pdf", "docx"].includes(mergeTarget)) {
    throw unsupportedFile("Merge output format must be PDF or DOCX.");
  }

  const convertedPdfInputs = [];
  for (let index = 0; index < inputFiles.length; index += 1) {
    const pdfPath = await toPdfForMerge({
      file: inputFiles[index],
      index,
      workDir,
      libreOfficeBin,
    });
    convertedPdfInputs.push({ path: pdfPath });
  }

  const mergedPdfPath = path.join(workDir, "merged_result.pdf");
  await mergePdfFiles({
    inputFiles: convertedPdfInputs,
    outputPath: mergedPdfPath,
  });

  if (mergeTarget === "pdf") {
    await fs.copy(mergedPdfPath, outputPath, { overwrite: true });
    return "Files merged into one PDF successfully.";
  }

  await convertWithLibreOffice({
    inputPath: mergedPdfPath,
    targetFormat: "docx",
    outputPath,
    libreOfficeBin,
  });
  return "Files merged and exported as DOCX successfully.";
}

export async function processFile({
  operation,
  targetFormat,
  pageRanges,
  rotationAngle,
  pages,
  inputFiles = [],
  outputBasePath,
  workDir,
  qpdfBin,
  libreOfficeBin,
}) {
  const normalizedOperation = (operation || "unlock").toLowerCase();
  if (!isValidOperation(normalizedOperation)) {
    throw unsupportedFile("Unsupported operation mode");
  }

  const files = (inputFiles || []).filter(Boolean);
  if (files.length === 0) {
    throw unsupportedFile("Please upload at least one file.");
  }

  if (normalizedOperation === "merge") {
    const mergeTarget = normalizeTargetFormat(targetFormat) || "pdf";
    const outputExtension = mergeTarget === "docx" ? ".docx" : ".pdf";
    const outputPath = createOutputPath(outputBasePath, outputExtension);

    const message = await mergeByType({
      inputFiles: files,
      outputPath,
      mergeTargetFormat: mergeTarget,
      workDir,
      libreOfficeBin,
    });
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

  if (normalizedOperation === "split") {
    if (files.length !== 1) {
      throw unsupportedFile("Split requires exactly one PDF file.");
    }

    const file = files[0];
    const fileType = detectFileType(file.originalName, file.mimeType);
    if (!fileType || fileType.extension !== ".pdf") {
      throw unsupportedFile("Split supports PDF files only.");
    }

    const outputDir = path.dirname(outputBasePath);
    const outputPrefix = sanitizeBaseName(path.parse(file.originalName).name);
    const splitOutputs = await splitPdfByRanges({
      inputPath: file.path,
      outputDir,
      outputPrefix,
      pageRanges,
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

  if (normalizedOperation === "rotate") {
    if (files.length !== 1) {
      throw unsupportedFile("Rotate requires exactly one PDF file.");
    }

    const file = files[0];
    const fileType = detectFileType(file.originalName, file.mimeType);
    if (!fileType || fileType.extension !== ".pdf") {
      throw unsupportedFile("Rotate supports PDF files only.");
    }

    const perFileBase = createPerFileOutputBase(outputBasePath, 0, file.originalName);
    const outputPath = createOutputPath(perFileBase, ".pdf");
    await rotatePdfPages({
      inputPath: file.path,
      outputPath,
      rotationAngle,
      pages,
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

  if (normalizedOperation === "compress") {
    const outputs = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const fileType = detectFileType(file.originalName, file.mimeType);
      if (!fileType || fileType.extension !== ".pdf") {
        throw unsupportedFile("Compress supports PDF files only.");
      }
      const perFileBase = createPerFileOutputBase(
        outputBasePath,
        index,
        file.originalName,
      );
      const outputPath = createOutputPath(perFileBase, ".pdf");
      await compressPdf({
        inputPath: file.path,
        outputPath,
        qpdfBin,
      });
      await ensureOutputExists(outputPath);
      const base = sanitizeBaseName(path.parse(file.originalName).name);
      outputs.push(
        createDescriptor({
          outputPath,
          outputExtension: ".pdf",
          sourceName: file.originalName,
          outputName: `${base}_compressed.pdf`,
          detectedType: "PDF",
          message: "PDF optimized (lossless) successfully.",
        }),
      );
    }
    return {
      message: `Compressed ${outputs.length} PDF(s) (lossless optimize).`,
      outputs,
    };
  }

  const outputs = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const fileType = detectFileType(file.originalName, file.mimeType);
    if (!fileType) {
      throw unsupportedFile(`Unsupported file: ${file.originalName}`);
    }

    const perFileBase = createPerFileOutputBase(
      outputBasePath,
      index,
      file.originalName,
    );

    if (normalizedOperation === "unlock") {
      const outputExtension = fileType.extension;
      const outputPath = createOutputPath(perFileBase, outputExtension);
      const message = await unlockByType({
        fileType,
        inputPath: file.path,
        outputPath,
        qpdfBin,
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
      continue;
    }

    if (normalizedOperation === "convert") {
      const normalizedTarget = normalizeTargetFormat(targetFormat);
      if (!normalizedTarget) {
        throw unsupportedFile("A target format is required for convert mode.");
      }

      const outputExtension = `.${normalizedTarget}`;
      const outputPath = createOutputPath(perFileBase, outputExtension);
      const message = await convertByType({
        fileType,
        inputPath: file.path,
        outputPath,
        targetFormat: normalizedTarget,
        libreOfficeBin,
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
      continue;
    }

    if (normalizedOperation === "ocr") {
      const outputExtension = ".txt";
      const outputPath = createOutputPath(perFileBase, outputExtension);
      const message = await ocrByType({
        fileType,
        inputPath: file.path,
        outputPath,
      });
      await ensureOutputExists(outputPath);

      outputs.push(
        createDescriptor({
          outputPath,
          outputExtension,
          sourceName: file.originalName,
          detectedType: "TXT",
          message,
        }),
      );
      continue;
    }

    throw unsupportedFile("Unsupported operation mode");
  }

  return {
    message: `Processed ${outputs.length} file(s) successfully.`,
    outputs,
  };
}
