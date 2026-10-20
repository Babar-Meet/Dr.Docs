// Rasters one PDF file into one image per page. This is the PDF -> JPG and
// PDF -> PNG convert pair, which unlike every other convert pair can
// produce several outputs from a single input file.
import path from "node:path";
import fs from "fs-extra";
import { PDFDocument } from "pdf-lib";
import { AppError } from "../errors.js";
import { SECURE_ENCRYPTION_MESSAGE } from "../constants.js";

// Industry standard rendering intent: 150 dpi (Google, iLovePDF and Sejda
// all land their per-page exports in this band). pdf.js works in 72 dpi
// units, so scale = dpi / 72.
const RENDER_DPI = 150;
const SCALE = RENDER_DPI / 72;

// One request should not produce thousands of image jobs; a 50 MB upload
// can carry thousands of pages, and the reference tools cap their exports
// too. Enforced before any page is rendered.
const MAX_PAGES = 200;

function toReason(error) {
  return error?.message || "Unknown PDF raster error";
}

function isPasswordError(reason) {
  return /(password|encrypted|decrypt)/i.test(reason || "");
}

// pdf.js can open PDFs that carry an owner password with an empty user
// password and would happily render them, so the encryption gate is
// pdf-lib's load, which refuses every encrypted file. The exact detection
// site and wording match rotateProcessor and pageNumbersProcessor.
async function assertNotEncrypted(inputPath) {
  try {
    const pdfBuffer = await fs.readFile(inputPath);
    const input = await PDFDocument.load(pdfBuffer);
    return input.getPageCount();
  } catch (error) {
    const reason = toReason(error);
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

async function loadRenderer() {
  try {
    const { pdf } = await import("pdf-to-img");
    const require = (await import("node:module")).createRequire(import.meta.url);
    const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
    // Plain absolute paths with forward slashes and a trailing slash: the
    // pdf.js node factories read font and CMap data with
    // fs.promises.readFile, which does not understand file:// URLs, and
    // the parameter validation requires a trailing forward slash.
    const docInitParams = {
      standardFontDataUrl:
        path.join(pdfjsRoot, "standard_fonts").replace(/\\/g, "/") + "/",
      cMapUrl: path.join(pdfjsRoot, "cmaps").replace(/\\/g, "/") + "/",
      cMapPacked: true,
    };
    return { pdf, docInitParams };
  } catch {
    // The renderer needs Node 22.13+ (>=24). Every other operation keeps
    // working on older runtimes because this import is dynamic.
    throw new AppError("Processing failed", "PROCESSING_FAILED", 500, {
      reason:
        "PDF page export needs Node 22.13 or newer installed on the server.",
    });
  }
}

export async function convertPdfToImages({
  inputPath,
  outputDir,
  outputPrefix,
  targetFormat,
}) {
  const pageCount = await assertNotEncrypted(inputPath);

  if (pageCount > MAX_PAGES) {
    throw new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, {
      reason: `This PDF has ${pageCount} pages. Export a PDF with up to ${MAX_PAGES} pages, or Split it first.`,
    });
  }

  const { pdf, docInitParams } = await loadRenderer();

  await fs.ensureDir(outputDir);

  const document = await pdf(inputPath, {
    scale: SCALE,
    format: targetFormat === "png" ? "png" : "jpg",
    docInitParams,
  });

  const rendered = [];
  try {
    let counter = 0;
    for await (const image of document) {
      counter += 1;
      const fileName = `page_${counter}.${targetFormat}`;
      const outputPath = path.join(outputDir, fileName);
      await fs.writeFile(outputPath, image);
      rendered.push({
        outputPath,
        outputName: `${outputPrefix}_${fileName}`,
      });
    }
  } catch (error) {
    throw new AppError("File corrupted", "FILE_CORRUPTED", 400, {
      reason: toReason(error),
    });
  } finally {
    await document.destroy();
  }

  if (rendered.length === 0) {
    throw new AppError("Processing failed", "PROCESSING_FAILED", 500, {
      reason: "No page was exported from the PDF.",
    });
  }

  return rendered;
}
