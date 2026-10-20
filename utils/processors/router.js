// processFile is the frozen dispatch boundary for every operation. It stays
// a named-argument contract on purpose: the contract tests in tests/
// drive this exact shape. Inside, it adapts to the operation registry in
// registry.js and delegates.
//
// Adding a new operation therefore means: one constants.js entry, one
// handler + registry line in registry.js, one named argument and one options
// entry in the adapter below, one route field in files.js. The per-operation
// flow itself lives only in registry.js.
import { isValidOperation } from "../helpers/fileType.js";
import { unsupportedFile } from "./descriptors.js";
import { OPERATION_HANDLERS } from "./registry.js";

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

  const handler = OPERATION_HANDLERS[normalizedOperation];
  if (!handler) {
    throw unsupportedFile("Unsupported operation mode");
  }

  const files = (inputFiles || []).filter(Boolean);
  if (files.length === 0) {
    throw unsupportedFile("Please upload at least one file.");
  }

  return handler({
    options: {
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
    },
    files,
    runtime: {
      outputBasePath,
      workDir,
      qpdfBin,
      libreOfficeBin,
    },
  });
}
