import fs from "fs-extra";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { AppError } from "../errors.js";

function parseReason(error) {
  return error?.message || "Unknown image processing error";
}

async function getImageMetadata(inputPath) {
  try {
    const metadata = await sharp(inputPath).metadata();
    if (!metadata.format || !metadata.width || !metadata.height) {
      throw new Error("Unsupported or invalid image");
    }

    return metadata;
  } catch (error) {
    throw new AppError("File corrupted", "FILE_CORRUPTED", 400, {
      reason: parseReason(error),
    });
  }
}

export async function optimizeImage({ inputPath, outputPath }) {
  const metadata = await getImageMetadata(inputPath);
  const pipeline = sharp(inputPath).rotate();

  if (metadata.format === "png") {
    await pipeline
      .png({ compressionLevel: 9, palette: true })
      .toFile(outputPath);
    return;
  }

  await pipeline.jpeg({ quality: 80, mozjpeg: true }).toFile(outputPath);
}

export async function repairImage({ inputPath, outputPath }) {
  const metadata = await getImageMetadata(inputPath);
  const pipeline = sharp(inputPath).rotate();

  try {
    if (metadata.format === "png") {
      await pipeline.png({ compressionLevel: 8 }).toFile(outputPath);
      return;
    }

    await pipeline.jpeg({ quality: 90, mozjpeg: true }).toFile(outputPath);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("File corrupted", "FILE_CORRUPTED", 400, {
      reason: parseReason(error),
    });
  }
}

export async function convertImageToFormat({
  inputPath,
  outputPath,
  targetFormat,
}) {
  await getImageMetadata(inputPath);
  const normalizedTarget = (targetFormat || "").toLowerCase();
  const pipeline = sharp(inputPath).rotate();

  try {
    if (normalizedTarget === "jpg" || normalizedTarget === "jpeg") {
      await pipeline.jpeg({ quality: 88, mozjpeg: true }).toFile(outputPath);
      return;
    }

    if (normalizedTarget === "png") {
      await pipeline
        .png({ compressionLevel: 9, palette: true })
        .toFile(outputPath);
      return;
    }

    if (normalizedTarget === "webp") {
      await pipeline.webp({ quality: 85 }).toFile(outputPath);
      return;
    }

    if (normalizedTarget === "avif") {
      await pipeline.avif({ quality: 55 }).toFile(outputPath);
      return;
    }

    if (normalizedTarget === "tiff") {
      await pipeline
        .tiff({ compression: "lzw", quality: 85 })
        .toFile(outputPath);
      return;
    }

    throw new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, {
      reason: "Unsupported image conversion target",
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Processing failed", "PROCESSING_FAILED", 500, {
      reason: parseReason(error),
    });
  }
}

export async function convertImageToPdf({ inputPath, outputPath }) {
  const metadata = await getImageMetadata(inputPath);
  const imageBuffer = await fs.readFile(inputPath);

  const pdfDocument = await PDFDocument.create();
  const embeddedImage =
    metadata.format === "png"
      ? await pdfDocument.embedPng(imageBuffer)
      : await pdfDocument.embedJpg(imageBuffer);

  const page = pdfDocument.addPage([embeddedImage.width, embeddedImage.height]);
  page.drawImage(embeddedImage, {
    x: 0,
    y: 0,
    width: embeddedImage.width,
    height: embeddedImage.height,
  });

  const pdfBytes = await pdfDocument.save();
  await fs.writeFile(outputPath, pdfBytes);
}
