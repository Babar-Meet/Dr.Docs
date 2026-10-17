import path from "node:path";
import fs from "fs-extra";
import { AppError } from "../errors.js";
import { runCommand } from "../helpers/command.js";
import { withLibreOfficeProfile } from "../helpers/libreOfficeProfile.js";

function parseReason(error) {
  return [error?.stderr, error?.stdout, error?.message]
    .filter(Boolean)
    .join(" ");
}

export async function convertWithLibreOffice({
  inputPath,
  targetFormat,
  outputPath,
  libreOfficeBin,
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
