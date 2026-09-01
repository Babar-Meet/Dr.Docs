import path from "node:path";
import { randomUUID } from "node:crypto";
import archiver from "archiver";
import mime from "mime-types";
import fs from "fs-extra";
import { AppError } from "../../../utils/errors.js";
import { processFile } from "../../../utils/processors/router.js";
import { safeRemoveDir, safeUnlink } from "../../../utils/helpers/fs.js";
import { LIBREOFFICE_BIN, OUTPUT_DIR, QPDF_BIN, WORK_DIR } from "../config.js";
import { setDownloadRecord } from "./downloadStore.js";

function sanitizeBaseName(name) {
  const raw = (name || "file").trim();
  const safe = raw.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
  return safe || "file";
}

async function createBatchArchive(records, archivePath) {
  await fs.ensureDir(path.dirname(archivePath));

  const outputStream = fs.createWriteStream(archivePath);
  const archive = archiver("zip", {
    zlib: { level: 9 },
  });

  const archiveDone = new Promise((resolve, reject) => {
    outputStream.on("close", resolve);
    outputStream.on("error", reject);
    archive.on("error", reject);
  });

  archive.pipe(outputStream);

  for (const record of records) {
    archive.file(record.filePath, { name: record.downloadName });
  }

  archive.finalize();
  await archiveDone;
}

export async function processUploadedFile(uploadedFile, options = {}) {
  const normalizedInputFiles = (options.inputFiles || []).filter(Boolean);
  if (normalizedInputFiles.length === 0 && uploadedFile) {
    normalizedInputFiles.push(uploadedFile);
  }

  if (normalizedInputFiles.length === 0) {
    throw new AppError("Unsupported file", "UNSUPPORTED_FILE", 400);
  }

  const processId = randomUUID();
  const jobWorkDir = path.join(WORK_DIR, processId);

  await fs.ensureDir(jobWorkDir);

  try {
    const processed = await processFile({
      operation: options.operation,
      targetFormat: options.targetFormat,
      pageRanges: options.pageRanges,
      rotationAngle: options.rotationAngle,
      pages: options.pages,
      inputFiles: normalizedInputFiles.map((file) => ({
        path: file.path,
        originalName: file.originalname,
        mimeType: file.mimetype,
      })),
      outputBasePath: path.join(OUTPUT_DIR, processId),
      workDir: jobWorkDir,
      qpdfBin: QPDF_BIN,
      libreOfficeBin: LIBREOFFICE_BIN,
    });

    const outputs = processed.outputs || [];
    if (outputs.length === 0) {
      throw new AppError("Processing failed", "PROCESSING_FAILED", 500, {
        reason: "No output files were generated.",
      });
    }

    const results = [];
    const outputRecords = [];

    for (let index = 0; index < outputs.length; index += 1) {
      const output = outputs[index];
      const downloadId = randomUUID();
      const fallbackBase = sanitizeBaseName(
        path.parse(output.sourceName || `file_${index + 1}`).name,
      );
      const downloadName =
        output.outputName ||
        `${fallbackBase}_processed${output.outputExtension}`;

      const outputMime =
        output.mimeType ||
        mime.lookup(output.outputExtension) ||
        "application/octet-stream";

      setDownloadRecord(downloadId, {
        filePath: output.outputPath,
        downloadName,
        mimeType: outputMime,
      });

      results.push({
        downloadId,
        downloadName,
        downloadUrl: `/download/${downloadId}`,
        detectedType: output.detectedType,
        message: output.message,
      });

      outputRecords.push({
        filePath: output.outputPath,
        downloadName,
      });
    }

    let batchDownloadId = null;
    let batchDownloadName = null;
    let batchDownloadUrl = null;

    if (outputRecords.length > 1) {
      batchDownloadId = randomUUID();
      batchDownloadName = `${options.operation || "files"}_all_processed.zip`;
      const batchArchivePath = path.join(OUTPUT_DIR, `${batchDownloadId}.zip`);

      await createBatchArchive(outputRecords, batchArchivePath);

      setDownloadRecord(batchDownloadId, {
        filePath: batchArchivePath,
        downloadName: batchDownloadName,
        mimeType: "application/zip",
      });

      batchDownloadUrl = `/download/${batchDownloadId}`;
    }

    return {
      status: "success",
      message: processed.message || `Processed ${results.length} file(s).`,
      results,
      downloadId: results[0]?.downloadId || null,
      downloadName: results[0]?.downloadName || null,
      downloadUrl: results[0]?.downloadUrl || null,
      batchDownloadId,
      batchDownloadName,
      batchDownloadUrl,
    };
  } finally {
    const cleanupPaths = new Set();
    for (const file of normalizedInputFiles) {
      if (file.path) {
        cleanupPaths.add(file.path);
      }
    }

    await Promise.allSettled(
      Array.from(cleanupPaths).map((filePath) => safeUnlink(filePath)),
    );
    await safeRemoveDir(jobWorkDir);
  }
}
