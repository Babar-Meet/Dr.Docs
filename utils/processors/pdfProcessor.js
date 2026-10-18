import path from "node:path";
import fs from "fs-extra";
import { PDFDocument } from "pdf-lib";
import { AppError } from "../errors.js";
import { runCommand } from "../helpers/command.js";
import { SECURE_ENCRYPTION_MESSAGE } from "../constants.js";

function isPdfPasswordError(rawText) {
  return /(password|required|invalid password|encrypted)/i.test(rawText || "");
}

function isPasswordError(rawText) {
  return /(password|encrypted|decrypt|requires a password)/i.test(rawText || "");
}

function toReason(error) {
  return [error?.stderr, error?.stdout, error?.message]
    .filter(Boolean)
    .join(" ");
}

async function hasRepairedOutput(outputPath) {
  if (!(await fs.pathExists(outputPath))) {
    return false;
  }

  const stats = await fs.stat(outputPath);
  return stats.size > 0;
}

async function ensurePdfNotEncryptedOrCorrupt(inputPath) {
  try {
    const buffer = await fs.readFile(inputPath);
    await PDFDocument.load(buffer);
  } catch (error) {
    const reason = error?.message || "";
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

export async function unlockPdfRestrictions({
  inputPath,
  outputPath,
  qpdfBin,
}) {
  try {
    await runCommand(qpdfBin, ["--decrypt", inputPath, outputPath], {
      timeoutMs: 120000,
    });
  } catch (error) {
    const reason = toReason(error);
    if (/file is not encrypted/i.test(reason)) {
      await fs.copy(inputPath, outputPath, { overwrite: true });
      return;
    }

    if (isPdfPasswordError(reason)) {
      throw new AppError(SECURE_ENCRYPTION_MESSAGE, "PASSWORD_REQUIRED", 400, {
        reason: "Password required",
      });
    }

    throw new AppError("Processing failed", "PROCESSING_FAILED", 500, {
      reason: reason || "qpdf failed while removing restrictions",
    });
  }
}

export async function compressPdf({ inputPath, outputPath, qpdfBin }) {
  await ensurePdfNotEncryptedOrCorrupt(inputPath);
  await fs.ensureDir(path.dirname(outputPath));
  try {
    await runCommand(
      qpdfBin,
      [
        "--linearize",
        "--object-streams=generate",
        "--stream-data=compress",
        inputPath,
        outputPath,
      ],
      { timeoutMs: 120000 },
    );
  } catch (error) {
    const reason = toReason(error);
    if (isPasswordError(reason)) {
      throw new AppError(SECURE_ENCRYPTION_MESSAGE, "PASSWORD_REQUIRED", 400, {
        reason: "Password required",
      });
    }
    if (/damaged|unable to|invalid/i.test(reason)) {
      throw new AppError("File corrupted", "FILE_CORRUPTED", 400, {
        reason,
      });
    }
    throw new AppError("Processing failed", "PROCESSING_FAILED", 500, {
      reason: reason || "qpdf failed while compressing",
    });
  }
}

export async function optimizePdf(args) {
  return compressPdf(args);
}

// Protect adds AES 256 password encryption through qpdf. The user password
// and owner password are set to the same value: opening and changing the file
// both require it. This creates protection; no existing protection is ever
// inspected or bypassed, and an already encrypted input is refused up front.
export async function protectPdf({ inputPath, outputPath, password, qpdfBin }) {
  if (!String(password || "").trim()) {
    throw new AppError(
      "Password is required to protect the PDF.",
      "PROCESSING_FAILED",
      400,
      { reason: "Missing password" },
    );
  }

  await ensurePdfNotEncryptedOrCorrupt(inputPath);
  await fs.ensureDir(path.dirname(outputPath));
  try {
    await runCommand(
      qpdfBin,
      [
        "--encrypt",
        String(password),
        String(password),
        "256",
        "--",
        inputPath,
        outputPath,
      ],
      { timeoutMs: 120000 },
    );
  } catch (error) {
    const reason = toReason(error);
    if (isPdfPasswordError(reason)) {
      throw new AppError(SECURE_ENCRYPTION_MESSAGE, "PASSWORD_REQUIRED", 400, {
        reason: "Password required",
      });
    }
    if (/damaged|unable to|invalid/i.test(reason)) {
      throw new AppError("File corrupted", "FILE_CORRUPTED", 400, {
        reason,
      });
    }
    throw new AppError("Processing failed", "PROCESSING_FAILED", 500, {
      reason: reason || "qpdf failed while adding password protection",
    });
  }
}

export async function repairPdf({ inputPath, outputPath, qpdfBin }) {
  try {
    await runCommand(qpdfBin, ["--linearize", inputPath, outputPath], {
      timeoutMs: 120000,
    });
  } catch (error) {
    const reason = toReason(error);

    // qpdf exits 3 when it repaired the file but issued warnings, and it still
    // writes the repaired output. That is a successful repair, not corruption.
    if (error?.exitCode === 3 && (await hasRepairedOutput(outputPath))) {
      return;
    }

    // qpdf refuses a password-protected PDF with "invalid password" and writes
    // no output. Report the password, never corruption, as unlock does.
    if (isPdfPasswordError(reason)) {
      throw new AppError(SECURE_ENCRYPTION_MESSAGE, "PASSWORD_REQUIRED", 400, {
        reason: "Password required",
      });
    }

    throw new AppError("File corrupted", "FILE_CORRUPTED", 400, {
      reason: reason || "qpdf could not repair this PDF",
    });
  }
}
