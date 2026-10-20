import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { AppError } from "../../../utils/errors.js";
import { SECURE_ENCRYPTION_MESSAGE } from "../../../utils/constants.js";
import { convertPdfToImages } from "../../../utils/processors/rasterProcessor.js";
import { runCommand } from "../../../utils/helpers/command.js";

const QPDF_BIN = process.env.QPDF_BIN || "qpdf";
const TMP_ROOT = path.join(os.tmpdir(), `drdocs-raster-${Date.now()}`);

async function makeTextPdf(dir, name, pages = 1) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([500, 300]);
    page.drawText(`Page ${i + 1}`, { x: 40, y: 200, size: 30, font });
  }
  const p = path.join(dir, name);
  await fs.writeFile(p, await doc.save());
  return p;
}

describe("convert -> PDF to images", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });

  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  it("rasterizes every page of a multipage PDF as separate JPG files", async () => {
    const work = path.join(TMP_ROOT, "jpg");
    await fs.ensureDir(work);
    const source = await makeTextPdf(work, "doc.pdf", 3);
    const parts = await convertPdfToImages({
      inputPath: source,
      outputDir: work,
      outputPrefix: "doc",
      targetFormat: "jpg",
    });

    assert.equal(parts.length, 3);
    assert.deepEqual(
      parts.map((p) => p.outputName),
      ["doc_page_1.jpg", "doc_page_2.jpg", "doc_page_3.jpg"],
    );

    for (const [index, part] of parts.entries()) {
      const bytes = await fs.readFile(part.outputPath);
      // JPEG magic bytes
      assert.equal(bytes.subarray(0, 2).toString("hex"), "ffd8");
      const sharp = (await import("sharp")).default;
      const meta = await sharp(part.outputPath).metadata();
      assert.equal(meta.format, "jpeg");
      const text = `Page ${index + 1}`;
      assert.ok(
        bytes.length > 1000,
        `${text}: expected a real image, got ${bytes.length} bytes`,
      );
      // pdf.js floors the viewport to whole device pixels
      assert.equal(meta.width, Math.floor((500 * 150) / 72));
      assert.equal(meta.height, Math.floor((300 * 150) / 72));
    }
  });

  it("rasterizes a single page PDF as exactly one file", async () => {
    const work = path.join(TMP_ROOT, "single");
    await fs.ensureDir(work);
    const source = await makeTextPdf(work, "one.pdf", 1);
    const parts = await convertPdfToImages({
      inputPath: source,
      outputDir: work,
      outputPrefix: "one",
      targetFormat: "png",
    });
    assert.equal(parts.length, 1);
    assert.equal(parts[0].outputName, "one_page_1.png");
    const bytes = await fs.readFile(parts[0].outputPath);
    // PNG magic bytes
    assert.equal(bytes.subarray(0, 4).toString("hex"), "89504e47");
  });

  it("caps the page count before rendering anything", async () => {
    const work = path.join(TMP_ROOT, "cap");
    await fs.ensureDir(work);
    const doc = await PDFDocument.create();
    for (let i = 0; i < 201; i++) {
      doc.addPage([500, 300]);
    }
    const source = path.join(work, "huge.pdf");
    await fs.writeFile(source, await doc.save());

    await assert.rejects(
      () =>
        convertPdfToImages({
          inputPath: source,
          outputDir: work,
          outputPrefix: "huge",
          targetFormat: "jpg",
        }),
      (err) =>
        err instanceof AppError &&
        err.code === "UNSUPPORTED_FILE" &&
        err.statusCode === 400 &&
        /201 pages/.test(err.details?.reason || ""),
    );
  });

  it("refuses an encrypted PDF with PASSWORD_REQUIRED and the frozen message", async () => {
    const work = path.join(TMP_ROOT, "encrypted");
    await fs.ensureDir(work);
    const plain = await makeTextPdf(work, "plain.pdf", 1);
    const locked = path.join(work, "locked.pdf");
    await runCommand(
      QPDF_BIN,
      ["--encrypt", "castle-key", "castle-key", "256", "--", plain, locked],
      { timeoutMs: 60000 },
    );

    await assert.rejects(
      () =>
        convertPdfToImages({
          inputPath: locked,
          outputDir: work,
          outputPrefix: "locked",
          targetFormat: "jpg",
        }),
      (err) =>
        err instanceof AppError &&
        err.code === "PASSWORD_REQUIRED" &&
        err.statusCode === 400 &&
        err.message === SECURE_ENCRYPTION_MESSAGE,
    );
  });

  it("reports FILE_CORRUPTED for bytes that are not a PDF", async () => {
    const work = path.join(TMP_ROOT, "corrupt");
    await fs.ensureDir(work);
    const fake = path.join(work, "fake.pdf");
    await fs.writeFile(fake, "this is not a pdf at all");

    await assert.rejects(
      () =>
        convertPdfToImages({
          inputPath: fake,
          outputDir: work,
          outputPrefix: "fake",
          targetFormat: "jpg",
        }),
      (err) =>
        err instanceof AppError && err.code === "FILE_CORRUPTED" && err.statusCode === 400,
    );
  });
});
