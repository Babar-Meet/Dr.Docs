import path from "node:path";
import fs from "fs-extra";
import {
  PDFArray,
  PDFBool,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
} from "pdf-lib";
import sharp from "sharp";
import { AppError } from "../errors.js";
import { runCommand } from "../helpers/command.js";
import { COMPRESSION_LEVELS, SECURE_ENCRYPTION_MESSAGE } from "../constants.js";

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
  password = "",
}) {
  // The password field only ever carries a password the user typed for this
  // job. qpdf uses it to open the file the user owns; a wrong or missing
  // password still fails with PASSWORD_REQUIRED, so nothing is bypassed.
  const args = ["--decrypt"];
  if (String(password || "").length > 0) {
    // qpdf 12 requires the form --password=value; separate arguments error out.
    args.push(`--password=${String(password)}`);
  }
  args.push(inputPath, outputPath);

  try {
    await runCommand(qpdfBin, args, {
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

// Lossy presets. The lossless level never reads this table: it runs the frozen
// qpdf command and leaves every image stream exactly as it is.
const LOSSY_PRESETS = {
  extreme: { maxWidth: 1000, quality: 50 },
  recommended: { maxWidth: 1500, quality: 75 },
  low: { maxWidth: 2000, quality: 85 },
};

// A declared image above this many pixels is left alone. It is a guard on the
// declared Width and Height, so an oversized image is skipped before it is
// ever decoded.
const MAX_LOSSY_IMAGE_PIXELS = 50 * 1000 * 1000;

// The dictionary's color space decides the color space of the bytes sharp
// writes back. sharp converts a CMYK or grayscale JPEG to sRGB unless the
// output color space is named explicitly, and that conversion is exactly how
// a /DeviceCMYK image ends up holding 3-channel sRGB bytes. The dictionary is
// never rewritten here: when the bytes cannot be produced in the declared
// color space, the image keeps its original stream.
const LOSSY_COLOR_SPACES = new Map([
  [PDFName.of("DeviceRGB"), { sharpSpace: "srgb", channels: 3 }],
  [PDFName.of("DeviceGray"), { sharpSpace: "b-w", channels: 1 }],
  [PDFName.of("DeviceCMYK"), { sharpSpace: "cmyk", channels: 4 }],
]);

export function normalizeCompressionLevel(compressionLevel) {
  const raw = compressionLevel == null ? "" : String(compressionLevel).trim();
  if (!raw) return "lossless";

  const level = raw.toLowerCase();
  if (!COMPRESSION_LEVELS.includes(level)) {
    throw new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, {
      reason: `Unsupported compression level: ${raw}. Use lossless, recommended, extreme, or low.`,
    });
  }
  return level;
}

// pdf-lib writes /Decode [1 0 1 0 1 0 1 0] when it embeds a CMYK JPEG, because
// Adobe CMYK JPEGs store inverted samples. That one array is not a reason to
// skip the image: sharp reads and writes the same Adobe convention, so the
// array stays correct after re-encoding. Any other /Decode array changes how
// the samples are read in a way this pass cannot preserve, so those images are
// skipped.
const INVERTED_CMYK_DECODE = [1, 0, 1, 0, 1, 0, 1, 0];

function isInvertedCmykDecode(value) {
  if (!(value instanceof PDFArray)) return false;
  const entries = value.asArray();
  if (entries.length !== INVERTED_CMYK_DECODE.length) return false;
  return entries.every(
    (entry, index) =>
      entry instanceof PDFNumber &&
      entry.asNumber() === INVERTED_CMYK_DECODE[index],
  );
}

// The Adobe APP14 marker tells a JPEG reader that the CMYK samples are stored
// inverted. The /Decode array above is only correct when both the source and
// the re-encoded stream carry that marker, so both are checked.
function hasAdobeApp14(buffer) {
  const bytes = Buffer.isBuffer(buffer)
    ? buffer
    : Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const tag = Buffer.from("Adobe", "latin1");
  const marker = Buffer.from([0xff, 0xee]);
  let index = bytes.indexOf(marker);
  while (index !== -1) {
    // A truncated stream can end on 0xFF 0xEE, where the APP14 length field
    // would run past the buffer. That is not a usable marker, so stop instead
    // of letting the read throw out of the compression pass.
    if (index + 4 > bytes.length) return false;
    const length = bytes.readUInt16BE(index + 2);
    if (bytes.subarray(index + 4, index + 9).equals(tag)) return true;
    if (length < 2) return false;
    index = bytes.indexOf(marker, index + 2 + length);
  }
  return false;
}

// Decides whether one image XObject may be re-encoded, and in which color
// space. Returns null for every image the lossy pass must not touch: an
// unsupported filter or color space, an entry that changes how the samples are
// read, a mask that would no longer line up after a resize, and a declared
// pixel count over the guard.
function readLossyImageTarget(dict, contents) {
  if (dict.get(PDFName.of("Filter")) !== PDFName.of("DCTDecode")) return null;

  const colorSpace = dict.get(PDFName.of("ColorSpace"));
  if (!(colorSpace instanceof PDFName)) return null;
  const target = LOSSY_COLOR_SPACES.get(colorSpace);
  if (!target) return null;

  const bitsPerComponent = dict.get(PDFName.of("BitsPerComponent"));
  if (bitsPerComponent !== undefined) {
    if (
      !(bitsPerComponent instanceof PDFNumber) ||
      bitsPerComponent.asNumber() !== 8
    ) {
      return null;
    }
  }

  const decode = dict.get(PDFName.of("Decode"));
  if (decode !== undefined) {
    if (
      target.sharpSpace !== "cmyk" ||
      !isInvertedCmykDecode(decode) ||
      !hasAdobeApp14(contents)
    ) {
      return null;
    }
  }
  if (dict.has(PDFName.of("DecodeParms"))) {
    return null;
  }
  if (dict.has(PDFName.of("Mask")) || dict.has(PDFName.of("SMask"))) {
    return null;
  }
  if (dict.get(PDFName.of("ImageMask")) === PDFBool.True) return null;

  const width = dict.get(PDFName.of("Width"));
  const height = dict.get(PDFName.of("Height"));
  if (!(width instanceof PDFNumber) || !(height instanceof PDFNumber)) {
    return null;
  }
  const widthValue = width.asNumber();
  const heightValue = height.asNumber();
  if (
    !Number.isInteger(widthValue) ||
    !Number.isInteger(heightValue) ||
    widthValue < 1 ||
    heightValue < 1 ||
    widthValue * heightValue > MAX_LOSSY_IMAGE_PIXELS
  ) {
    return null;
  }

  return {
    sharpSpace: target.sharpSpace,
    channels: target.channels,
    width: widthValue,
    height: heightValue,
    invertedCmyk: decode !== undefined,
  };
}

// Re-encodes one JPEG stream and proves the result before it is used: same
// color space, same channel count, and the dimensions the dictionary will
// carry. Returns null when any of that fails, so the caller keeps the original
// stream rather than writing bytes the dictionary does not describe. The
// pipeline colour space keeps the work in the declared space: without it a
// CMYK or grayscale image travels through sRGB and comes back with clipped,
// slightly shifted CMYK or gray samples.
async function reencodeJpegStream(contents, target, preset) {
  const original = await sharp(contents).metadata();
  if (
    original.width !== target.width ||
    original.height !== target.height ||
    original.channels !== target.channels
  ) {
    return null;
  }

  let pipeline = sharp(contents).pipelineColourspace(target.sharpSpace);
  if (
    original.width > preset.maxWidth ||
    original.height > preset.maxWidth
  ) {
    pipeline = pipeline.resize({
      width: preset.maxWidth,
      height: preset.maxWidth,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const buffer = await pipeline
    .toColourspace(target.sharpSpace)
    .jpeg({ quality: preset.quality })
    .toBuffer();

  if (target.invertedCmyk && !hasAdobeApp14(buffer)) {
    return null;
  }

  const reencoded = await sharp(buffer).metadata();
  if (
    reencoded.space !== target.sharpSpace ||
    reencoded.channels !== target.channels
  ) {
    return null;
  }

  return { buffer, width: reencoded.width, height: reencoded.height };
}

async function writeLossyPdf(inputPath, tempPath, preset) {
  const pdfBuffer = await fs.readFile(inputPath);
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  // pdf-lib adds a blank page to a document that has none when it saves, so a
  // page-less file must skip the image pass entirely and go straight to qpdf.
  if (pdfDoc.getPageCount() === 0) return false;

  const enumerated = pdfDoc.context.enumerateIndirectObjects();
  let modified = false;

  for (const [ref, obj] of enumerated) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (dict.get(PDFName.of("Subtype")) !== PDFName.of("Image")) continue;

    const target = readLossyImageTarget(dict, obj.contents);
    if (!target) continue;

    try {
      const reencoded = await reencodeJpegStream(obj.contents, target, preset);
      if (!reencoded || reencoded.buffer.length >= obj.contents.length) {
        continue;
      }

      dict.set(PDFName.of("Width"), pdfDoc.context.obj(reencoded.width));
      dict.set(PDFName.of("Height"), pdfDoc.context.obj(reencoded.height));
      dict.set(PDFName.of("Length"), pdfDoc.context.obj(reencoded.buffer.length));
      pdfDoc.context.assign(ref, PDFRawStream.of(dict, reencoded.buffer));
      modified = true;
    } catch {
      // One unreadable image must not fail the whole file. It keeps its
      // original stream and the rest of the document is still optimized.
    }
  }

  if (!modified) return false;
  await fs.writeFile(tempPath, await pdfDoc.save());
  return true;
}

export async function compressPdf({
  inputPath,
  outputPath,
  qpdfBin,
  compressionLevel = "lossless",
}) {
  const level = normalizeCompressionLevel(compressionLevel);
  const isLossy = level !== "lossless";

  await ensurePdfNotEncryptedOrCorrupt(inputPath);
  await fs.ensureDir(path.dirname(outputPath));

  let sourceForQpdf = inputPath;
  let tempDownsampledPath = null;

  if (isLossy) {
    tempDownsampledPath = `${outputPath}.downsampled.tmp.pdf`;
    try {
      const reencoded = await writeLossyPdf(
        inputPath,
        tempDownsampledPath,
        LOSSY_PRESETS[level],
      );
      if (reencoded) {
        sourceForQpdf = tempDownsampledPath;
      }
    } catch {
      // The image pass is optional: a document-level failure there must not
      // cancel the qpdf pass, which still compresses the original file.
    }
  }

  const qpdfArgs = isLossy
    ? [
        "--object-streams=generate",
        "--stream-data=compress",
        "--recompress-flate",
        "--compression-level=9",
        "--coalesce-contents",
        "--remove-unreferenced-resources=yes",
        sourceForQpdf,
        outputPath,
      ]
    : [
        "--linearize",
        "--object-streams=generate",
        "--stream-data=compress",
        sourceForQpdf,
        outputPath,
      ];

  let keptOriginal = false;

  try {
    await runCommand(qpdfBin, qpdfArgs, { timeoutMs: 120000 });

    if (isLossy) {
      const inputStat = await fs.stat(inputPath);
      const outputStat = await fs.stat(outputPath).catch(() => null);
      if (!outputStat) {
        throw new AppError("Processing failed", "PROCESSING_FAILED", 500, {
          reason: "qpdf did not create a compressed output",
        });
      }
      // A lossy run that cannot beat the source is not worth shipping: the
      // original bytes are copied through and the caller reports that.
      if (outputStat.size >= inputStat.size) {
        await fs.copy(inputPath, outputPath, { overwrite: true });
        keptOriginal = true;
      }
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
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
  } finally {
    if (tempDownsampledPath) {
      await fs.remove(tempDownsampledPath).catch(() => {});
    }
  }

  return { keptOriginal };
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
