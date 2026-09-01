import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { PDFDocument } from "pdf-lib";
import { AppError } from "../../../utils/errors.js";
import { convertImageToFormat, convertImageToPdf, optimizeImage, repairImage } from "../../../utils/processors/imageProcessor.js";

const TMP_ROOT = path.join(os.tmpdir(), `drdocs-image-${Date.now()}`);

async function createPng(dir, name, width = 20, height = 20, color = { r: 100, g: 150, b: 200 }) {
  const sharp = (await import("sharp")).default;
  const buf = await sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
  const p = path.join(dir, name);
  await fs.writeFile(p, buf);
  return p;
}

async function createJpeg(dir, name, width = 20, height = 20) {
  const sharp = (await import("sharp")).default;
  const buf = await sharp({ create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } } }).jpeg().toBuffer();
  const p = path.join(dir, name);
  await fs.writeFile(p, buf);
  return p;
}

describe("imageProcessor sharp conversion", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });
  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  describe("convertImageToFormat happy paths", () => {
    it("converts png to jpg", async () => {
      const work = path.join(TMP_ROOT, "png-to-jpg");
      await fs.ensureDir(work);
      const src = await createPng(work, "in.png");
      const out = path.join(work, "out.jpg");
      await assert.doesNotReject(() => convertImageToFormat({ inputPath: src, outputPath: out, targetFormat: "jpg" }));
      assert.ok(await fs.pathExists(out));
      const stat = await fs.stat(out);
      assert.ok(stat.size > 0);
      const sharp = (await import("sharp")).default;
      const meta = await sharp(out).metadata();
      assert.equal(meta.format, "jpeg");
    });

    it("converts png to jpeg alias", async () => {
      const work = path.join(TMP_ROOT, "png-to-jpeg");
      await fs.ensureDir(work);
      const src = await createPng(work, "in.png");
      const out = path.join(work, "out.jpeg");
      await convertImageToFormat({ inputPath: src, outputPath: out, targetFormat: "jpeg" });
      assert.ok(await fs.pathExists(out));
    });

    it("converts jpg to png", async () => {
      const work = path.join(TMP_ROOT, "jpg-to-png");
      await fs.ensureDir(work);
      const src = await createJpeg(work, "in.jpg");
      const out = path.join(work, "out.png");
      await convertImageToFormat({ inputPath: src, outputPath: out, targetFormat: "png" });
      assert.ok(await fs.pathExists(out));
      const sharp = (await import("sharp")).default;
      const meta = await sharp(out).metadata();
      assert.equal(meta.format, "png");
    });

    it("converts png to webp", async () => {
      const work = path.join(TMP_ROOT, "png-to-webp");
      await fs.ensureDir(work);
      const src = await createPng(work, "in.png");
      const out = path.join(work, "out.webp");
      await convertImageToFormat({ inputPath: src, outputPath: out, targetFormat: "webp" });
      assert.ok(await fs.pathExists(out));
    });

    it("converts jpg to avif", async () => {
      const work = path.join(TMP_ROOT, "jpg-to-avif");
      await fs.ensureDir(work);
      const src = await createJpeg(work, "in.jpg");
      const out = path.join(work, "out.avif");
      await convertImageToFormat({ inputPath: src, outputPath: out, targetFormat: "avif" });
      assert.ok(await fs.pathExists(out));
    });

    it("converts png to tiff", async () => {
      const work = path.join(TMP_ROOT, "png-to-tiff");
      await fs.ensureDir(work);
      const src = await createPng(work, "in.png");
      const out = path.join(work, "out.tiff");
      await convertImageToFormat({ inputPath: src, outputPath: out, targetFormat: "tiff" });
      assert.ok(await fs.pathExists(out));
    });

    it("is case-insensitive for targetFormat", async () => {
      const work = path.join(TMP_ROOT, "case-insensitive");
      await fs.ensureDir(work);
      const src = await createPng(work, "in.png");
      const out = path.join(work, "out.jpg");
      await convertImageToFormat({ inputPath: src, outputPath: out, targetFormat: "JPG" });
      assert.ok(await fs.pathExists(out));
    });
  });

  describe("convertImageToPdf", () => {
    it("converts png to pdf with single page sized to image", async () => {
      const work = path.join(TMP_ROOT, "png-to-pdf");
      await fs.ensureDir(work);
      const src = await createPng(work, "in.png", 50, 30);
      const out = path.join(work, "out.pdf");
      await assert.doesNotReject(() => convertImageToPdf({ inputPath: src, outputPath: out }));
      assert.ok(await fs.pathExists(out));
      const bytes = await fs.readFile(out);
      const doc = await PDFDocument.load(bytes);
      assert.equal(doc.getPageCount(), 1);
      const page = doc.getPages()[0];
      assert.ok(page.getWidth() > 0);
      assert.ok(page.getHeight() > 0);
    });

    it("converts jpeg to pdf", async () => {
      const work = path.join(TMP_ROOT, "jpg-to-pdf");
      await fs.ensureDir(work);
      const src = await createJpeg(work, "in.jpg", 40, 40);
      const out = path.join(work, "out.pdf");
      await convertImageToPdf({ inputPath: src, outputPath: out });
      assert.ok(await fs.pathExists(out));
      const doc = await PDFDocument.load(await fs.readFile(out));
      assert.equal(doc.getPageCount(), 1);
    });

    it("pdf output is valid and starts with %PDF", async () => {
      const work = path.join(TMP_ROOT, "pdf-valid");
      await fs.ensureDir(work);
      const src = await createPng(work, "in.png");
      const out = path.join(work, "out.pdf");
      await convertImageToPdf({ inputPath: src, outputPath: out });
      const data = await fs.readFile(out);
      assert.ok(data.toString().startsWith("%PDF"));
    });
  });

  describe("invalid image -> FILE_CORRUPTED", () => {
    it("throws FILE_CORRUPTED for corrupt png bytes", async () => {
      const work = path.join(TMP_ROOT, "corrupt-png");
      await fs.ensureDir(work);
      const bad = path.join(work, "bad.png");
      await fs.writeFile(bad, Buffer.from("not a png at all"));
      const out = path.join(work, "out.jpg");
      await assert.rejects(() => convertImageToFormat({ inputPath: bad, outputPath: out, targetFormat: "jpg" }), (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "FILE_CORRUPTED");
        assert.equal(err.statusCode, 400);
        return true;
      });
    });

    it("throws FILE_CORRUPTED for empty file", async () => {
      const work = path.join(TMP_ROOT, "empty-img");
      await fs.ensureDir(work);
      const empty = path.join(work, "empty.jpg");
      await fs.writeFile(empty, Buffer.alloc(0));
      const out = path.join(work, "out.png");
      await assert.rejects(() => convertImageToFormat({ inputPath: empty, outputPath: out, targetFormat: "png" }), (err) => err.code === "FILE_CORRUPTED");
    });

    it("throws FILE_CORRUPTED for truncated png", async () => {
      const work = path.join(TMP_ROOT, "trunc-png");
      await fs.ensureDir(work);
      const src = await createPng(work, "orig.png");
      const buf = await fs.readFile(src);
      const truncated = buf.subarray(0, 10);
      const bad = path.join(work, "trunc.png");
      await fs.writeFile(bad, truncated);
      const out = path.join(work, "out.jpg");
      await assert.rejects(() => convertImageToFormat({ inputPath: bad, outputPath: out, targetFormat: "jpg" }), (err) => err.code === "FILE_CORRUPTED");
    });

    it("throws FILE_CORRUPTED for convertImageToPdf with invalid image", async () => {
      const work = path.join(TMP_ROOT, "corrupt-pdf");
      await fs.ensureDir(work);
      const bad = path.join(work, "bad.png");
      await fs.writeFile(bad, Buffer.from("bad data"));
      const out = path.join(work, "out.pdf");
      await assert.rejects(() => convertImageToPdf({ inputPath: bad, outputPath: out }), (err) => err.code === "FILE_CORRUPTED");
    });

    it("throws UNSUPPORTED_FILE for unsupported target format", async () => {
      const work = path.join(TMP_ROOT, "unsupported-target");
      await fs.ensureDir(work);
      const src = await createPng(work, "in.png");
      const out = path.join(work, "out.xyz");
      await assert.rejects(() => convertImageToFormat({ inputPath: src, outputPath: out, targetFormat: "xyz" }), (err) => err.code === "UNSUPPORTED_FILE");
      await assert.rejects(() => convertImageToFormat({ inputPath: src, outputPath: out, targetFormat: "docx" }), (err) => err.code === "UNSUPPORTED_FILE");
    });

    it("handles missing input file as FILE_CORRUPTED", async () => {
      const work = path.join(TMP_ROOT, "missing-input");
      await fs.ensureDir(work);
      const fake = path.join(work, "nope.png");
      const out = path.join(work, "out.jpg");
      await assert.rejects(() => convertImageToFormat({ inputPath: fake, outputPath: out, targetFormat: "jpg" }), (err) => err.code === "FILE_CORRUPTED");
    });
  });

  describe("batch processing", () => {
    it("converts batch of images sequentially without interference", async () => {
      const work = path.join(TMP_ROOT, "batch");
      await fs.ensureDir(work);
      const png1 = await createPng(work, "1.png", 10, 10, { r: 255, g: 0, b: 0 });
      const png2 = await createPng(work, "2.png", 15, 15, { r: 0, g: 255, b: 0 });
      const jpg1 = await createJpeg(work, "3.jpg", 12, 12);
      const sources = [png1, png2, jpg1];
      const targets = ["jpg", "webp", "png"];
      const outputs = [];
      for (let i = 0; i < sources.length; i++) {
        const out = path.join(work, `out_${i}.${targets[i]}`);
        await convertImageToFormat({ inputPath: sources[i], outputPath: out, targetFormat: targets[i] });
        assert.ok(await fs.pathExists(out));
        outputs.push(out);
      }
      assert.equal(outputs.length, 3);
    });

    it("batch pdf conversion for multiple images", async () => {
      const work = path.join(TMP_ROOT, "batch-pdf");
      await fs.ensureDir(work);
      const images = [];
      for (let i = 0; i < 3; i++) {
        images.push(await createPng(work, `img${i}.png`, 10 + i, 10 + i));
      }
      const pdfOutputs = [];
      for (let i = 0; i < images.length; i++) {
        const out = path.join(work, `out${i}.pdf`);
        await convertImageToPdf({ inputPath: images[i], outputPath: out });
        assert.ok(await fs.pathExists(out));
        const doc = await PDFDocument.load(await fs.readFile(out));
        assert.equal(doc.getPageCount(), 1);
        pdfOutputs.push(out);
      }
      assert.equal(pdfOutputs.length, 3);
    });

    it("optimizeImage and repairImage handle batch", async () => {
      const work = path.join(TMP_ROOT, "optimize-batch");
      await fs.ensureDir(work);
      const png = await createPng(work, "a.png");
      const jpg = await createJpeg(work, "b.jpg");
      const outPng = path.join(work, "opt.png");
      const outJpg = path.join(work, "opt.jpg");
      await optimizeImage({ inputPath: png, outputPath: outPng });
      await optimizeImage({ inputPath: jpg, outputPath: outJpg });
      assert.ok(await fs.pathExists(outPng));
      assert.ok(await fs.pathExists(outJpg));
      const outRepair = path.join(work, "repair.png");
      await repairImage({ inputPath: png, outputPath: outRepair });
      assert.ok(await fs.pathExists(outRepair));
    });
  });

  describe("edge and idempotency", () => {
    it("double conversion of same image yields same output format", async () => {
      const work = path.join(TMP_ROOT, "double");
      await fs.ensureDir(work);
      const src = await createPng(work, "in.png");
      const out1 = path.join(work, "out1.jpg");
      const out2 = path.join(work, "out2.jpg");
      await convertImageToFormat({ inputPath: src, outputPath: out1, targetFormat: "jpg" });
      await convertImageToFormat({ inputPath: src, outputPath: out2, targetFormat: "jpg" });
      const stat1 = await fs.stat(out1);
      const stat2 = await fs.stat(out2);
      assert.ok(stat1.size > 0);
      assert.ok(stat2.size > 0);
      assert.ok(Math.abs(stat1.size - stat2.size) < 500);
    });

    it("convertImageToFormat handles file with spaces in path", async () => {
      const work = path.join(TMP_ROOT, "spaces");
      await fs.ensureDir(work);
      const src = await createPng(work, "my image.png");
      const out = path.join(work, "out file.jpg");
      await convertImageToFormat({ inputPath: src, outputPath: out, targetFormat: "jpg" });
      assert.ok(await fs.pathExists(out));
    });
  });
});
