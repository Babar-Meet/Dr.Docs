import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { PDFDocument } from "pdf-lib";
import { AppError } from "../../../utils/errors.js";
import { SECURE_ENCRYPTION_MESSAGE } from "../../../utils/constants.js";
import { mergePdfFiles, splitPdfByRanges } from "../../../utils/processors/mergeSplitProcessor.js";
import { processFile } from "../../../utils/processors/router.js";

const TMP_ROOT = path.join(os.tmpdir(), `drdocs-mergeSplit-${Date.now()}`);

async function makePdf(dir, name, pages = 1, textPrefix = "") {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([300, 400]);
    if (textPrefix) {
      // No font needed for page count; just add empty page
    }
  }
  const bytes = await doc.save();
  const p = path.join(dir, name);
  await fs.writeFile(p, bytes);
  return p;
}

async function makePngImage(dir, name = "sample.png") {
  const sharp = (await import("sharp")).default;
  const buffer = await sharp({
    create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 100, b: 50 } },
  }).png().toBuffer();
  const p = path.join(dir, name);
  await fs.writeFile(p, buffer);
  return p;
}

async function makeJpgImage(dir, name = "sample.jpg") {
  const sharp = (await import("sharp")).default;
  const buf = await sharp({
    create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 128, b: 255 } },
  }).jpeg().toBuffer();
  const p = path.join(dir, name);
  await fs.writeFile(p, buf);
  return p;
}

describe("mergeSplitProcessor", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });
  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  describe("mergePdfFiles happy path", () => {
    it("merges 2 pdfs into one with summed page count", async () => {
      const work = path.join(TMP_ROOT, "merge2");
      await fs.ensureDir(work);
      const p1 = await makePdf(work, "a.pdf", 1);
      const p2 = await makePdf(work, "b.pdf", 2);
      const out = path.join(work, "merged.pdf");
      await assert.doesNotReject(() => mergePdfFiles({ inputFiles: [{ path: p1 }, { path: p2 }], outputPath: out }));
      assert.ok(await fs.pathExists(out));
      const bytes = await fs.readFile(out);
      const doc = await PDFDocument.load(bytes);
      assert.equal(doc.getPageCount(), 3);
    });

    it("merges 3 pdfs correctly", async () => {
      const work = path.join(TMP_ROOT, "merge3");
      await fs.ensureDir(work);
      const p1 = await makePdf(work, "1.pdf", 1);
      const p2 = await makePdf(work, "2.pdf", 1);
      const p3 = await makePdf(work, "3.pdf", 1);
      const out = path.join(work, "merged3.pdf");
      await mergePdfFiles({ inputFiles: [{ path: p1 }, { path: p2 }, { path: p3 }], outputPath: out });
      const doc = await PDFDocument.load(await fs.readFile(out));
      assert.equal(doc.getPageCount(), 3);
    });

    it("merges pdf+images via processFile router (images converted to pdf then merged)", async () => {
      const work = path.join(TMP_ROOT, "merge-router-images");
      await fs.ensureDir(work);
      const pdf = await makePdf(work, "base.pdf", 1);
      const png = await makePngImage(work, "img.png");
      const jpg = await makeJpgImage(work, "photo.jpg");
      const outBase = path.join(work, "merged_out");
      const result = await processFile({
        operation: "merge",
        targetFormat: "pdf",
        inputFiles: [
          { path: pdf, originalName: "base.pdf", mimeType: "application/pdf" },
          { path: png, originalName: "img.png", mimeType: "image/png" },
          { path: jpg, originalName: "photo.jpg", mimeType: "image/jpeg" },
        ],
        outputBasePath: outBase,
        workDir: path.join(work, "workdir"),
      });
      assert.equal(result.outputs.length, 1);
      assert.ok(result.outputs[0].outputPath.endsWith(".pdf"));
      const doc = await PDFDocument.load(await fs.readFile(result.outputs[0].outputPath));
      assert.equal(doc.getPageCount(), 3);
    });

    it("merges pdf+docx via router when docx converts to pdf (mocked via existing Docs)", async () => {
      const work = path.join(TMP_ROOT, "merge-docx");
      await fs.ensureDir(work);
      const pdf1 = await makePdf(work, "p1.pdf", 1);
      const pdf2 = await makePdf(work, "p2.pdf", 1);
      // Test docx path via router with 2 pdfs + ensure merge to docx works when libreOffice available
      // If libreOffice not available, router will throw PROCESSING_FAILED for docx->pdf conversion, so we test pdf->pdf merging to docx conversion step
      // First merge pdfs to pdf directly
      const outBase = path.join(work, "mergeDocx");
      // Use pdf inputs to test merge to docx output: after merging pdfs, it converts merged pdf to docx via libreOffice
      // This may succeed or fail depending on libreOffice; we check both outcomes are handled cleanly
      try {
        const result = await processFile({
          operation: "merge",
          targetFormat: "docx",
          inputFiles: [
            { path: pdf1, originalName: "p1.pdf", mimeType: "application/pdf" },
            { path: pdf2, originalName: "p2.pdf", mimeType: "application/pdf" },
          ],
          outputBasePath: outBase,
          workDir: path.join(work, "workdir2"),
          libreOfficeBin: "soffice",
        });
        assert.equal(result.outputs.length, 1);
        assert.ok(result.outputs[0].outputPath.endsWith(".docx"));
      } catch (err) {
        // If libreOffice conversion fails, should be PROCESSING_FAILED not UNSUPPORTED_FILE
        assert.equal(err.code, "PROCESSING_FAILED");
      }
    });

    it("merge creates output directory if not exists", async () => {
      const work = path.join(TMP_ROOT, "merge-dir-create");
      await fs.ensureDir(work);
      const p1 = await makePdf(work, "a.pdf", 1);
      const p2 = await makePdf(work, "b.pdf", 1);
      const out = path.join(work, "nested", "deep", "merged.pdf");
      await mergePdfFiles({ inputFiles: [{ path: p1 }, { path: p2 }], outputPath: out });
      assert.ok(await fs.pathExists(out));
    });
  });

  describe("merge validation and errors", () => {
    it("throws UNSUPPORTED_FILE when less than 2 files (empty)", async () => {
      const work = path.join(TMP_ROOT, "merge-empty");
      await fs.ensureDir(work);
      const out = path.join(work, "out.pdf");
      await assert.rejects(() => mergePdfFiles({ inputFiles: [], outputPath: out }), (err) => err.code === "UNSUPPORTED_FILE");
      await assert.rejects(() => mergePdfFiles({ inputFiles: [{ path: "x" }], outputPath: out }), (err) => err.code === "UNSUPPORTED_FILE");
    });

    it("throws UNSUPPORTED_FILE when inputFiles is null/undefined", async () => {
      const work = path.join(TMP_ROOT, "merge-null");
      await fs.ensureDir(work);
      await assert.rejects(() => mergePdfFiles({ inputFiles: null, outputPath: path.join(work, "out.pdf") }), (err) => err.code === "UNSUPPORTED_FILE");
      await assert.rejects(() => mergePdfFiles({ inputFiles: undefined, outputPath: path.join(work, "out.pdf") }), (err) => err.code === "UNSUPPORTED_FILE");
    });

    it("throws FILE_CORRUPTED for invalid pdf input", async () => {
      const work = path.join(TMP_ROOT, "merge-corrupt");
      await fs.ensureDir(work);
      const bad = path.join(work, "bad.pdf");
      await fs.writeFile(bad, Buffer.from("not a pdf"));
      const good = await makePdf(work, "good.pdf", 1);
      const out = path.join(work, "out.pdf");
      await assert.rejects(() => mergePdfFiles({ inputFiles: [{ path: bad }, { path: good }], outputPath: out }), (err) => err.code === "FILE_CORRUPTED");
    });

    it("throws PASSWORD_REQUIRED for encrypted pdf", async () => {
      const work = path.join(TMP_ROOT, "merge-enc");
      await fs.ensureDir(work);
      const encPath = path.join(work, "enc.pdf");
      // Create a pdf that when loaded throws password error: mock PDFDocument.load to simulate?
      // Instead use real encrypted fixture if available
      const lockedEnc = path.resolve("Docs/pdf/locked/enc.pdf");
      let enc = encPath;
      if (await fs.pathExists(lockedEnc)) {
        enc = lockedEnc;
      } else {
        // Simulate by creating a file that will trigger password detection via stub: we test via router that password error is preserved
        // Create invalid that throws password-like message by mocking? Simpler: verify that our isPasswordError detection works with direct encrypted buffer check via pdf-lib
        // For this test, we will stub PDFDocument.load to throw password error
        const { PDFDocument } = await import("pdf-lib");
        const originalLoad = PDFDocument.load;
        PDFDocument.load = async () => { throw new Error("File is encrypted with password"); };
        const good = await makePdf(work, "good2.pdf", 1);
        const out = path.join(work, "out2.pdf");
        try {
          await assert.rejects(() => mergePdfFiles({ inputFiles: [{ path: good }, { path: path.join(work, "dummy.pdf") }], outputPath: out }), (err) => err.code === "PASSWORD_REQUIRED" && err.message === SECURE_ENCRYPTION_MESSAGE);
        } finally {
          PDFDocument.load = originalLoad;
        }
        return;
      }
      const good = await makePdf(work, "good.pdf", 1);
      const out = path.join(work, "out.pdf");
      await assert.rejects(() => mergePdfFiles({ inputFiles: [{ path: enc }, { path: good }], outputPath: out }), (err) => err.code === "PASSWORD_REQUIRED" && err.message === SECURE_ENCRYPTION_MESSAGE);
    });

    it("router merge validates ZIP not supported", async () => {
      const work = path.join(TMP_ROOT, "merge-zip-router");
      await fs.ensureDir(work);
      const pdf = await makePdf(work, "a.pdf", 1);
      const zipPath = path.join(work, "a.zip");
      await fs.writeFile(zipPath, "PK");
      await assert.rejects(
        () => processFile({
          operation: "merge",
          targetFormat: "pdf",
          inputFiles: [
            { path: pdf, originalName: "a.pdf", mimeType: "application/pdf" },
            { path: zipPath, originalName: "a.zip", mimeType: "application/zip" },
          ],
          outputBasePath: path.join(work, "out"),
          workDir: path.join(work, "wd"),
        }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });

    it("router merge requires at least 2 files", async () => {
      const work = path.join(TMP_ROOT, "merge-router-few");
      await fs.ensureDir(work);
      const pdf = await makePdf(work, "single.pdf", 1);
      await assert.rejects(
        () => processFile({
          operation: "merge",
          targetFormat: "pdf",
          inputFiles: [{ path: pdf, originalName: "single.pdf", mimeType: "application/pdf" }],
          outputBasePath: path.join(work, "out"),
          workDir: work,
        }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });

    it("router merge invalid target format throws UNSUPPORTED_FILE", async () => {
      const work = path.join(TMP_ROOT, "merge-bad-target");
      await fs.ensureDir(work);
      const p1 = await makePdf(work, "1.pdf", 1);
      const p2 = await makePdf(work, "2.pdf", 1);
      await assert.rejects(
        () => processFile({
          operation: "merge",
          targetFormat: "zip",
          inputFiles: [
            { path: p1, originalName: "1.pdf", mimeType: "application/pdf" },
            { path: p2, originalName: "2.pdf", mimeType: "application/pdf" },
          ],
          outputBasePath: path.join(work, "out"),
          workDir: work,
        }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });
  });

  describe("split by ranges", () => {
    it("splits with pageRanges '1' into single page output", async () => {
      const work = path.join(TMP_ROOT, "split-1");
      await fs.ensureDir(work);
      const pdf = await makePdf(work, "src.pdf", 3);
      const outputs = await splitPdfByRanges({ inputPath: pdf, outputDir: work, outputPrefix: "doc", pageRanges: "1" });
      assert.equal(outputs.length, 1);
      assert.ok(await fs.pathExists(outputs[0].outputPath));
      const doc = await PDFDocument.load(await fs.readFile(outputs[0].outputPath));
      assert.equal(doc.getPageCount(), 1);
      assert.match(outputs[0].outputName, /page_1\.pdf/);
    });

    it("splits '1,2-3' into two outputs with correct page counts", async () => {
      const work = path.join(TMP_ROOT, "split-1-2-3");
      await fs.ensureDir(work);
      const pdf = await makePdf(work, "src.pdf", 5);
      const outputs = await splitPdfByRanges({ inputPath: pdf, outputDir: work, outputPrefix: "doc", pageRanges: "1,2-3" });
      assert.equal(outputs.length, 2);
      const doc0 = await PDFDocument.load(await fs.readFile(outputs[0].outputPath));
      const doc1 = await PDFDocument.load(await fs.readFile(outputs[1].outputPath));
      assert.equal(doc0.getPageCount(), 1);
      assert.equal(doc1.getPageCount(), 2);
    });

    it("splits '2-4' single range with 3 pages", async () => {
      const work = path.join(TMP_ROOT, "split-2-4");
      await fs.ensureDir(work);
      const pdf = await makePdf(work, "src.pdf", 5);
      const outputs = await splitPdfByRanges({ inputPath: pdf, outputDir: work, outputPrefix: "test", pageRanges: "2-4" });
      assert.equal(outputs.length, 1);
      const doc = await PDFDocument.load(await fs.readFile(outputs[0].outputPath));
      assert.equal(doc.getPageCount(), 3);
      assert.match(outputs[0].outputName, /pages_2-4\.pdf/);
    });

    it("empty pageRanges means each page separately", async () => {
      const work = path.join(TMP_ROOT, "split-empty");
      await fs.ensureDir(work);
      const pdf = await makePdf(work, "src.pdf", 2);
      const outputs = await splitPdfByRanges({ inputPath: pdf, outputDir: work, outputPrefix: "doc", pageRanges: "" });
      assert.equal(outputs.length, 2);
      for (const o of outputs) {
        const doc = await PDFDocument.load(await fs.readFile(o.outputPath));
        assert.equal(doc.getPageCount(), 1);
      }
    });

    it("null/undefined pageRanges also means all pages individually", async () => {
      const work = path.join(TMP_ROOT, "split-null");
      await fs.ensureDir(work);
      const pdf = await makePdf(work, "src.pdf", 3);
      const out1 = await splitPdfByRanges({ inputPath: pdf, outputDir: work, outputPrefix: "doc", pageRanges: null });
      assert.equal(out1.length, 3);
      const out2 = await splitPdfByRanges({ inputPath: pdf, outputDir: path.join(work, "out2"), outputPrefix: "doc2", pageRanges: undefined });
      assert.equal(out2.length, 3);
    });

    it("handles out-of-order pages '3,1' creates two outputs in requested order", async () => {
      const work = path.join(TMP_ROOT, "split-outoforder");
      await fs.ensureDir(work);
      const pdf = await makePdf(work, "src.pdf", 5);
      const outputs = await splitPdfByRanges({ inputPath: pdf, outputDir: work, outputPrefix: "doc", pageRanges: "3,1" });
      assert.equal(outputs.length, 2);
      assert.match(outputs[0].outputName, /page_3/);
      assert.match(outputs[1].outputName, /page_1/);
      // Verify each has 1 page
      for (const o of outputs) {
        const doc = await PDFDocument.load(await fs.readFile(o.outputPath));
        assert.equal(doc.getPageCount(), 1);
      }
    });

    it("handles out-of-order ranges '5-3' style? Actually invalid because end < start, should throw", async () => {
      const work = path.join(TMP_ROOT, "split-reverse");
      await fs.ensureDir(work);
      const pdf = await makePdf(work, "src.pdf", 5);
      await assert.rejects(() => splitPdfByRanges({ inputPath: pdf, outputDir: work, outputPrefix: "doc", pageRanges: "3-1" }), (err) => err.code === "UNSUPPORTED_FILE");
    });

    it("validates invalid ranges throws UNSUPPORTED_FILE", async () => {
      const work = path.join(TMP_ROOT, "split-invalid");
      await fs.ensureDir(work);
      const pdf = await makePdf(work, "src.pdf", 2);
      await assert.rejects(() => splitPdfByRanges({ inputPath: pdf, outputDir: work, outputPrefix: "doc", pageRanges: "0" }), (err) => err.code === "UNSUPPORTED_FILE");
      await assert.rejects(() => splitPdfByRanges({ inputPath: pdf, outputDir: work, outputPrefix: "doc", pageRanges: "5" }), (err) => err.code === "UNSUPPORTED_FILE");
      await assert.rejects(() => splitPdfByRanges({ inputPath: pdf, outputDir: work, outputPrefix: "doc", pageRanges: "1-10" }), (err) => err.code === "UNSUPPORTED_FILE");
      await assert.rejects(() => splitPdfByRanges({ inputPath: pdf, outputDir: work, outputPrefix: "doc", pageRanges: "abc" }), (err) => err.code === "UNSUPPORTED_FILE");
      await assert.rejects(() => splitPdfByRanges({ inputPath: pdf, outputDir: work, outputPrefix: "doc", pageRanges: "1-" }), (err) => err.code === "UNSUPPORTED_FILE");
      await assert.rejects(() => splitPdfByRanges({ inputPath: pdf, outputDir: work, outputPrefix: "doc", pageRanges: "-5" }), (err) => err.code === "UNSUPPORTED_FILE");
    });

    it("handles whitespace trimming in pageRanges", async () => {
      const work = path.join(TMP_ROOT, "split-whitespace");
      await fs.ensureDir(work);
      const pdf = await makePdf(work, "src.pdf", 4);
      const outputs = await splitPdfByRanges({ inputPath: pdf, outputDir: work, outputPrefix: "doc", pageRanges: " 1 , 2-3 " });
      assert.equal(outputs.length, 2);
    });

    it("creates output dir if not exists", async () => {
      const work = path.join(TMP_ROOT, "split-mkdir");
      await fs.ensureDir(work);
      const nested = path.join(work, "a", "b", "c");
      const pdf = await makePdf(work, "src.pdf", 2);
      const outputs = await splitPdfByRanges({ inputPath: pdf, outputDir: nested, outputPrefix: "doc", pageRanges: "1" });
      assert.ok(await fs.pathExists(outputs[0].outputPath));
    });
  });

  describe("double-click idempotency", () => {
    it("merge same inputs twice yields same output without corruption", async () => {
      const work = path.join(TMP_ROOT, "idempotency-merge");
      await fs.ensureDir(work);
      const p1 = await makePdf(work, "a.pdf", 1);
      const p2 = await makePdf(work, "b.pdf", 1);
      const out1 = path.join(work, "merged1.pdf");
      const out2 = path.join(work, "merged2.pdf");
      await mergePdfFiles({ inputFiles: [{ path: p1 }, { path: p2 }], outputPath: out1 });
      await mergePdfFiles({ inputFiles: [{ path: p1 }, { path: p2 }], outputPath: out2 });
      const buf1 = await fs.readFile(out1);
      const buf2 = await fs.readFile(out2);
      const doc1 = await PDFDocument.load(buf1);
      const doc2 = await PDFDocument.load(buf2);
      assert.equal(doc1.getPageCount(), doc2.getPageCount());
      assert.equal(doc1.getPageCount(), 2);
    });

    it("split same input twice yields same number of outputs and identical page counts", async () => {
      const work = path.join(TMP_ROOT, "idempotency-split");
      await fs.ensureDir(work);
      const pdf = await makePdf(work, "src.pdf", 3);
      const outDir1 = path.join(work, "out1");
      const outDir2 = path.join(work, "out2");
      await fs.ensureDir(outDir1);
      await fs.ensureDir(outDir2);
      const outputs1 = await splitPdfByRanges({ inputPath: pdf, outputDir: outDir1, outputPrefix: "doc", pageRanges: "1,2-3" });
      const outputs2 = await splitPdfByRanges({ inputPath: pdf, outputDir: outDir2, outputPrefix: "doc", pageRanges: "1,2-3" });
      assert.equal(outputs1.length, outputs2.length);
      for (let i = 0; i < outputs1.length; i++) {
        const doc1 = await PDFDocument.load(await fs.readFile(outputs1[i].outputPath));
        const doc2 = await PDFDocument.load(await fs.readFile(outputs2[i].outputPath));
        assert.equal(doc1.getPageCount(), doc2.getPageCount());
      }
    });

    it("processFile merge double invocation via router is idempotent", async () => {
      const work = path.join(TMP_ROOT, "router-idempotent");
      await fs.ensureDir(work);
      const p1 = await makePdf(work, "a.pdf", 1);
      const p2 = await makePdf(work, "b.pdf", 1);
      const inputs = [
        { path: p1, originalName: "a.pdf", mimeType: "application/pdf" },
        { path: p2, originalName: "b.pdf", mimeType: "application/pdf" },
      ];
      const outBase1 = path.join(work, "out1");
      const outBase2 = path.join(work, "out2");
      const r1 = await processFile({ operation: "merge", targetFormat: "pdf", inputFiles: inputs, outputBasePath: outBase1, workDir: path.join(work, "wd1") });
      const r2 = await processFile({ operation: "merge", targetFormat: "pdf", inputFiles: inputs, outputBasePath: outBase2, workDir: path.join(work, "wd2") });
      assert.equal(r1.outputs.length, 1);
      assert.equal(r2.outputs.length, 1);
      const doc1 = await PDFDocument.load(await fs.readFile(r1.outputs[0].outputPath));
      const doc2 = await PDFDocument.load(await fs.readFile(r2.outputs[0].outputPath));
      assert.equal(doc1.getPageCount(), 2);
      assert.equal(doc2.getPageCount(), 2);
    });
  });

  describe("empty inputs and error paths", () => {
    it("merge via router throws UNSUPPORTED_FILE for empty array", async () => {
      const work = path.join(TMP_ROOT, "router-merge-empty");
      await fs.ensureDir(work);
      await assert.rejects(
        () => processFile({ operation: "merge", inputFiles: [], outputBasePath: path.join(work, "out"), workDir: work }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });

    it("split via router throws UNSUPPORTED_FILE for empty pageRanges out of bounds", async () => {
      const work = path.join(TMP_ROOT, "router-split-invalid");
      await fs.ensureDir(work);
      const pdf = await makePdf(work, "src.pdf", 1);
      await assert.rejects(
        () => processFile({
          operation: "split",
          pageRanges: "99",
          inputFiles: [{ path: pdf, originalName: "src.pdf", mimeType: "application/pdf" }],
          outputBasePath: path.join(work, "out"),
          workDir: work,
        }),
        (err) => err.code === "UNSUPPORTED_FILE" || err.code === "FILE_CORRUPTED"
      );
    });

    it("mergePdfFiles throws FILE_CORRUPTED for missing input file", async () => {
      const work = path.join(TMP_ROOT, "merge-missing");
      await fs.ensureDir(work);
      const p1 = await makePdf(work, "exists.pdf", 1);
      const out = path.join(work, "out.pdf");
      await assert.rejects(
        () => mergePdfFiles({ inputFiles: [{ path: p1 }, { path: path.join(work, "missing.pdf") }], outputPath: out }),
        (err) => err.code === "FILE_CORRUPTED" || err.code === "PASSWORD_REQUIRED"
      );
    });
  });
});
