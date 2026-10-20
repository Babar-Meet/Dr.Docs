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
    libreOfficeBin,
    infilter: PDF_INTO_WRITER_INFILTER,
  });
  return "Files merged and exported as DOCX successfully.";
}

export async function processFile({
  operation,
  targetFormat,
  pageRanges,
  splitEvery,
  rotationAngle,
  pages,
  password,
  rotations,
  watermarkText,
  watermarkAngle,
  watermarkOpacity,
  watermarkType,
  pageNumberPosition,
  pageNumberMargin,
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
      splitEvery,
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
      rotations,
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

  if (normalizedOperation === "protect") {
    const protectedPassword = String(password || "");
    if (!protectedPassword.trim()) {
      throw unsupportedFile("Enter a password to protect the PDF.");
    }
    const outputs = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const fileType = detectFileType(file.originalName, file.mimeType);
      if (!fileType || fileType.extension !== ".pdf") {
        throw unsupportedFile("Protect supports PDF files only.");
      }
      const perFileBase = createPerFileOutputBase(
        outputBasePath,
        index,
        file.originalName,
      );
      const outputPath = createOutputPath(perFileBase, ".pdf");
      await protectPdf({
        inputPath: file.path,
        outputPath,
        password: protectedPassword,
        qpdfBin,
      });
      await ensureOutputExists(outputPath);
      const base = sanitizeBaseName(path.parse(file.originalName).name);
      outputs.push(
        createDescriptor({
          outputPath,
          outputExtension: ".pdf",
          sourceName: file.originalName,
          outputName: `${base}_protected.pdf`,
          detectedType: "PDF",
          message: "PDF password protected successfully.",
        }),
      );
    }
    return {
      message: `Protected ${outputs.length} PDF(s) with a password.`,
      outputs,
    };
  }

  if (normalizedOperation === "watermark") {
    const outputs = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const fileType = detectFileType(file.originalName, file.mimeType);
      if (!fileType || fileType.extension !== ".pdf") {
        throw unsupportedFile("Watermark supports PDF files only.");
      }
      const perFileBase = createPerFileOutputBase(
        outputBasePath,
        index,
        file.originalName,
      );
      const outputPath = createOutputPath(perFileBase, ".pdf");
      await watermarkPdf({
        inputPath: file.path,
        outputPath,
        text: watermarkText,
        angle: watermarkAngle,
        opacity: watermarkOpacity,
        type: watermarkType,
      });
      await ensureOutputExists(outputPath);
      const base = sanitizeBaseName(path.parse(file.originalName).name);
      outputs.push(
        createDescriptor({
          outputPath,
          outputExtension: ".pdf",
          sourceName: file.originalName,
          outputName: `${base}_watermark.pdf`,
          detectedType: "PDF",
          message: "PDF watermarked successfully.",
        }),
      );
    }
    return {
      message: `Watermarked ${outputs.length} PDF(s).`,
      outputs,
    };
  }

  if (normalizedOperation === "pagenumbers") {
    const outputs = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const fileType = detectFileType(file.originalName, file.mimeType);
      if (!fileType || fileType.extension !== ".pdf") {
        throw unsupportedFile("Page numbers supports PDF files only.");
      }
      const perFileBase = createPerFileOutputBase(
        outputBasePath,
        index,
        file.originalName,
      );
      const outputPath = createOutputPath(perFileBase, ".pdf");
      await pageNumberPdf({
        inputPath: file.path,
        outputPath,
        position: pageNumberPosition,
        margin: pageNumberMargin,
      });
      await ensureOutputExists(outputPath);
      const base = sanitizeBaseName(path.parse(file.originalName).name);
      outputs.push(
        createDescriptor({
          outputPath,
          outputExtension: ".pdf",
          sourceName: file.originalName,
          outputName: `${base}_numbered.pdf`,
          detectedType: "PDF",
          message: "Page numbers added successfully.",
        }),
      );
    }
    return {
      message: `Numbered ${outputs.length} PDF(s).`,
      outputs,
    };
  }

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
        password,
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

    if (normalizedOperation === "repair") {
      const outputExtension = fileType.extension;
      const outputPath = createOutputPath(perFileBase, outputExtension);
      const message = await repairByType({
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

        const outputDir = path.dirname(outputBasePath);
        const imageOutputs = await convertPdfToImages({
          inputPath: file.path,
          outputDir,
          outputPrefix: sanitizeBaseName(
            path.parse(file.originalName).name,
          ),
          targetFormat: normalizedTarget,
        });

        for (const [index, part] of imageOutputs.entries()) {
          await ensureOutputExists(part.outputPath);
          outputs.push(
            createDescriptor({
              outputPath: part.outputPath,
              outputExtension: `.${normalizedTarget}`,
              sourceName: path.parse(part.outputName).name,
              outputName: part.outputName,
              detectedType: normalizedTarget.toUpperCase(),
              message: `Page ${index + 1} exported as ${normalizedTarget.toUpperCase()}.`,
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
    message: rasterMessage || `Processed ${outputs.length} file(s) successfully.`,
    outputs,
  };
}
