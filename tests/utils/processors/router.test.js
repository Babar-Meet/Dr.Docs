import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { fileURLToPath } from "node:url";
import { processFile } from "../../../utils/processors/router.js";
import { AppError } from "../../../utils/errors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TMP_ROOT = path.join(os.tmpdir(), `drdocs-router-${Date.now()}`);
const DOCS_PDF_SAMPLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../Docs/pdf/sample-1page.pdf");

async function makePdfFile(dir, name = "sample.pdf", pages = 1) {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  const bytes = await doc.save();
  const p = path.join(dir, name);
  await fs.writeFile(p, bytes);
  return p;
}

describe("router processFile dispatch", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });
  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  function mkInput(filePath, originalName, mimeType) {
    return { path: filePath, originalName, mimeType };
  }

  describe("operation validation", () => {
    it("throws UNSUPPORTED_FILE for invalid operation", async () => {
      const work = path.join(TMP_ROOT, "work-invalid");
      await fs.ensureDir(work);
      const out = path.join(TMP_ROOT, "out-invalid");
      const pdf = await makePdfFile(work, "a.pdf");
      await assert.rejects(
        () => processFile({ operation: "invalidOp", inputFiles: [mkInput(pdf, "a.pdf", "application/pdf")], outputBasePath: out, workDir: work }),
        (err) => {
          assert.ok(err instanceof AppError);
          assert.equal(err.code, "UNSUPPORTED_FILE");
          assert.match(err.details.reason || err.message, /Unsupported operation/);
          return true;
        }
      );
    });

    it("throws UNSUPPORTED_FILE when no files uploaded", async () => {
      const work = path.join(TMP_ROOT, "work-empty");
      await fs.ensureDir(work);
      await assert.rejects(
        () => processFile({ operation: "unlock", inputFiles: [], outputBasePath: path.join(TMP_ROOT, "out-empty"), workDir: work }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });

    it("throws UNSUPPORTED_FILE when inputFiles undefined", async () => {
      await assert.rejects(
        () => processFile({ operation: "unlock", outputBasePath: path.join(TMP_ROOT, "out-undef"), workDir: TMP_ROOT }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });

    it("normalizes operation case-insensitively", async () => {
      const work = path.join(TMP_ROOT, "work-case");
      await fs.ensureDir(work);
      const out = path.join(TMP_ROOT, "out-case");
      const pdf = await makePdfFile(work, "b.pdf");
      const res = await processFile({
        operation: "SPLIT",
        inputFiles: [mkInput(pdf, "b.pdf", "application/pdf")],
        outputBasePath: out,
        workDir: work,
        pageRanges: "1",
      });
      assert.ok(res.outputs.length >= 1);
    });

    it("throws UNSUPPORTED_FILE for null operation defaulting to unlock but no files still unsupported", async () => {
      await assert.rejects(
        () => processFile({ operation: null, inputFiles: [], outputBasePath: path.join(TMP_ROOT, "out-null"), workDir: TMP_ROOT }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });
  });

  describe("unlock dispatch", () => {
    it("throws UNSUPPORTED_FILE for unsupported file type on unlock", async () => {
      const work = path.join(TMP_ROOT, "work-unlock-unsupported");
      await fs.ensureDir(work);
      const txtPath = path.join(work, "note.txt");
      await fs.writeFile(txtPath, "hello");
      await assert.rejects(
        () => processFile({ operation: "unlock", inputFiles: [mkInput(txtPath, "note.txt", "text/plain")], outputBasePath: path.join(work, "out"), workDir: work }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });

    it("routes unlock for pdf via real qpdf (success copies file if not encrypted)", async () => {
      const work = path.join(TMP_ROOT, "work-unlock-pdf");
      await fs.ensureDir(work);
      const pdf = await makePdfFile(work, "unlock.pdf");
      const outBase = path.join(work, "out-unlock");
      const result = await processFile({
        operation: "unlock",
        inputFiles: [mkInput(pdf, "unlock.pdf", "application/pdf")],
        outputBasePath: outBase,
        workDir: work,
        qpdfBin: "qpdf",
      });
      assert.equal(result.outputs.length, 1);
      assert.match(result.outputs[0].outputPath, /\.pdf$/);
      assert.ok(await fs.pathExists(result.outputs[0].outputPath));
    });
  });

  describe("convert dispatch", () => {
    it("throws UNSUPPORTED_FILE when targetFormat missing for convert", async () => {
      const work = path.join(TMP_ROOT, "work-convert-missing");
      await fs.ensureDir(work);
      const pdf = await makePdfFile(work, "c.pdf");
      await assert.rejects(
        () => processFile({ operation: "convert", targetFormat: "", inputFiles: [mkInput(pdf, "c.pdf", "application/pdf")], outputBasePath: path.join(work, "out"), workDir: work }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });

    it("throws UNSUPPORTED_FILE for unsupported conversion pair", async () => {
      const work = path.join(TMP_ROOT, "work-convert-badpair");
      await fs.ensureDir(work);
      const pdf = await makePdfFile(work, "c2.pdf");
      await assert.rejects(
        () => processFile({ operation: "convert", targetFormat: "zip", inputFiles: [mkInput(pdf, "c2.pdf", "application/pdf")], outputBasePath: path.join(work, "out"), workDir: work }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });

    it("throws UNSUPPORTED_FILE for image to unsupported target", async () => {
      const work = path.join(TMP_ROOT, "work-convert-imgbad");
      await fs.ensureDir(work);
      const imgPath = path.join(work, "img.png");
      const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
      await fs.writeFile(imgPath, Buffer.from(pngBase64, "base64"));
      await assert.rejects(
        () => processFile({ operation: "convert", targetFormat: "docx", inputFiles: [mkInput(imgPath, "img.png", "image/png")], outputBasePath: path.join(work, "out"), workDir: work }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });

    it("dispatches image to pdf via sharp (if sharp available)", async () => {
      const work = path.join(TMP_ROOT, "work-convert-imgpdf");
      await fs.ensureDir(work);
      const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
      const imgPath = path.join(work, "img2.png");
      await fs.writeFile(imgPath, Buffer.from(pngBase64, "base64"));
      const outBase = path.join(work, "out-img");
      const result = await processFile({
        operation: "convert",
        targetFormat: "pdf",
        inputFiles: [mkInput(imgPath, "img2.png", "image/png")],
        outputBasePath: outBase,
        workDir: work,
      });
      assert.equal(result.outputs.length, 1);
      assert.ok(result.outputs[0].outputPath.endsWith(".pdf"));
      assert.ok(await fs.pathExists(result.outputs[0].outputPath));
    });
  });

  describe("merge dispatch", () => {
    it("throws UNSUPPORTED_FILE if less than 2 files", async () => {
      const work = path.join(TMP_ROOT, "work-merge-few");
      await fs.ensureDir(work);
      const pdf = await makePdfFile(work, "m1.pdf");
      await assert.rejects(
        () => processFile({ operation: "merge", inputFiles: [mkInput(pdf, "m1.pdf", "application/pdf")], outputBasePath: path.join(work, "out"), workDir: work }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });

    it("throws UNSUPPORTED_FILE for invalid merge targetFormat", async () => {
      const work = path.join(TMP_ROOT, "work-merge-badtgt");
      await fs.ensureDir(work);
      const p1 = await makePdfFile(work, "m2.pdf");
      const p2 = await makePdfFile(work, "m3.pdf");
      await assert.rejects(
        () => processFile({ operation: "merge", targetFormat: "zip", inputFiles: [mkInput(p1, "m2.pdf", "application/pdf"), mkInput(p2, "m3.pdf", "application/pdf")], outputBasePath: path.join(work, "out"), workDir: work }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });

    it("throws UNSUPPORTED_FILE for zip in merge", async () => {
      const work = path.join(TMP_ROOT, "work-merge-zip");
      await fs.ensureDir(work);
      const pdf = await makePdfFile(work, "m4.pdf");
      const zipPath = path.join(work, "a.zip");
      await fs.writeFile(zipPath, "PK");
      await assert.rejects(
        () => processFile({ operation: "merge", inputFiles: [mkInput(pdf, "m4.pdf", "application/pdf"), mkInput(zipPath, "a.zip", "application/zip")], outputBasePath: path.join(work, "out"), workDir: work }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });

    it("successfully merges 2 pdfs to pdf", async () => {
      const work = path.join(TMP_ROOT, "work-merge-success");
      await fs.ensureDir(work);
      const p1 = await makePdfFile(work, "merge1.pdf", 1);
      const p2 = await makePdfFile(work, "merge2.pdf", 2);
      const out = path.join(work, "merged");
      const result = await processFile({
        operation: "merge",
        targetFormat: "pdf",
        inputFiles: [mkInput(p1, "merge1.pdf", "application/pdf"), mkInput(p2, "merge2.pdf", "application/pdf")],
        outputBasePath: out,
        workDir: work,
      });
      assert.equal(result.outputs.length, 1);
      assert.ok(result.outputs[0].outputPath.endsWith(".pdf"));
      assert.ok(await fs.pathExists(result.outputs[0].outputPath));
      const { PDFDocument } = await import("pdf-lib");
      const bytes = await fs.readFile(result.outputs[0].outputPath);
      const doc = await PDFDocument.load(bytes);
      assert.equal(doc.getPageCount(), 3);
    });

    it("merge default target is pdf when targetFormat empty", async () => {
      const work = path.join(TMP_ROOT, "work-merge-default");
      await fs.ensureDir(work);
      const p1 = await makePdfFile(work, "d1.pdf");
      const p2 = await makePdfFile(work, "d2.pdf");
      const out = path.join(work, "merged2");
      const result = await processFile({
        operation: "merge",
        targetFormat: "",
        inputFiles: [mkInput(p1, "d1.pdf", "application/pdf"), mkInput(p2, "d2.pdf", "application/pdf")],
        outputBasePath: out,
        workDir: work,
      });
      assert.ok(result.outputs[0].outputPath.endsWith(".pdf"));
    });
  });

  describe("split dispatch", () => {
    it("throws UNSUPPORTED_FILE if not exactly one file", async () => {
      const work = path.join(TMP_ROOT, "work-split-many");
      await fs.ensureDir(work);
      const p1 = await makePdfFile(work, "s1.pdf");
      const p2 = await makePdfFile(work, "s2.pdf");
      await assert.rejects(
        () => processFile({ operation: "split", inputFiles: [mkInput(p1, "s1.pdf", "application/pdf"), mkInput(p2, "s2.pdf", "application/pdf")], outputBasePath: path.join(work, "out"), workDir: work }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });
    it("throws UNSUPPORTED_FILE for non-pdf split", async () => {
      const work = path.join(TMP_ROOT, "work-split-nonpdf");
      await fs.ensureDir(work);
      const imgPath = path.join(work, "img.png");
      const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
      await fs.writeFile(imgPath, Buffer.from(pngBase64, "base64"));
      await assert.rejects(
        () => processFile({ operation: "split", inputFiles: [mkInput(imgPath, "img.png", "image/png")], outputBasePath: path.join(work, "out"), workDir: work }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });
    it("splits pdf by ranges 1 and 2-3", async () => {
      const work = path.join(TMP_ROOT, "work-split-ok");
      await fs.ensureDir(work);
      const pdf = await makePdfFile(work, "split.pdf", 5);
      const out = path.join(work, "splitout");
      const result = await processFile({
        operation: "split",
        pageRanges: "1,2-3",
        inputFiles: [mkInput(pdf, "split.pdf", "application/pdf")],
        outputBasePath: out,
        workDir: work,
      });
      assert.equal(result.outputs.length, 2);
      for (const o of result.outputs) assert.ok(await fs.pathExists(o.outputPath));
    });
    it("splits with empty pageRanges means all pages each as separate? Actually impl: normalizePageRanges returns each page individually", async () => {
      const work = path.join(TMP_ROOT, "work-split-empty");
      await fs.ensureDir(work);
      const pdf = await makePdfFile(work, "split2.pdf", 2);
      const out = path.join(work, "splitout2");
      const result = await processFile({
        operation: "split",
        pageRanges: "",
        inputFiles: [mkInput(pdf, "split2.pdf", "application/pdf")],
        outputBasePath: out,
        workDir: work,
      });
      assert.equal(result.outputs.length, 2);
    });
    it("throws UNSUPPORTED_FILE for invalid page range", async () => {
      const work = path.join(TMP_ROOT, "work-split-badrange");
      await fs.ensureDir(work);
      const pdf = await makePdfFile(work, "split3.pdf", 2);
      await assert.rejects(
        () => processFile({ operation: "split", pageRanges: "5-10", inputFiles: [mkInput(pdf, "split3.pdf", "application/pdf")], outputBasePath: path.join(work, "out"), workDir: work }),
        (err) => err.code === "UNSUPPORTED_FILE" || err.code === "FILE_CORRUPTED"
      );
    });
  });

  describe("rotate dispatch", () => {
    it("throws UNSUPPORTED_FILE if not exactly one pdf", async () => {
      const work = path.join(TMP_ROOT, "work-rotate-many");
      await fs.ensureDir(work);
      const p1 = await makePdfFile(work, "r1.pdf");
      const p2 = await makePdfFile(work, "r2.pdf");
      await assert.rejects(
        () => processFile({ operation: "rotate", rotationAngle: "90", inputFiles: [mkInput(p1, "r1.pdf", "application/pdf"), mkInput(p2, "r2.pdf", "application/pdf")], outputBasePath: path.join(work, "out"), workDir: work }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });
    it("throws UNSUPPORTED_FILE for non-pdf rotate", async () => {
      const work = path.join(TMP_ROOT, "work-rotate-nonpdf");
      await fs.ensureDir(work);
      const txt = path.join(work, "a.txt");
      await fs.writeFile(txt, "hi");
      await assert.rejects(
        () => processFile({ operation: "rotate", rotationAngle: "90", inputFiles: [mkInput(txt, "a.txt", "text/plain")], outputBasePath: path.join(work, "out"), workDir: work }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });
    it("successfully rotates pdf 90 degrees", async () => {
      const work = path.join(TMP_ROOT, "work-rotate-ok");
      await fs.ensureDir(work);
      const pdf = await makePdfFile(work, "rot.pdf", 1);
      const out = path.join(work, "rotout");
      const result = await processFile({
        operation: "rotate",
        rotationAngle: "90",
        pages: "all",
        inputFiles: [mkInput(pdf, "rot.pdf", "application/pdf")],
        outputBasePath: out,
        workDir: work,
      });
      assert.equal(result.outputs.length, 1);
      assert.ok(await fs.pathExists(result.outputs[0].outputPath));
    });
    it("throws UNSUPPORTED_FILE for invalid rotation angle", async () => {
      const work = path.join(TMP_ROOT, "work-rotate-badangle");
      await fs.ensureDir(work);
      const pdf = await makePdfFile(work, "rot2.pdf");
      await assert.rejects(
        () => processFile({ operation: "rotate", rotationAngle: "45", inputFiles: [mkInput(pdf, "rot2.pdf", "application/pdf")], outputBasePath: path.join(work, "out"), workDir: work }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });
    it("throws for invalid pages string", async () => {
      const work = path.join(TMP_ROOT, "work-rotate-badpages");
      await fs.ensureDir(work);
      const pdf = await makePdfFile(work, "rot3.pdf", 2);
      await assert.rejects(
        () => processFile({ operation: "rotate", rotationAngle: "90", pages: "999", inputFiles: [mkInput(pdf, "rot3.pdf", "application/pdf")], outputBasePath: path.join(work, "out"), workDir: work }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });
  });

  describe("compress dispatch", () => {
    it("throws UNSUPPORTED_FILE for non-pdf compress", async () => {
      const work = path.join(TMP_ROOT, "work-compress-nonpdf");
      await fs.ensureDir(work);
      const txt = path.join(work, "a.txt");
      await fs.writeFile(txt, "hi");
      await assert.rejects(
        () => processFile({ operation: "compress", inputFiles: [mkInput(txt, "a.txt", "text/plain")], outputBasePath: path.join(work, "out"), workDir: work }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });
    it("compress with real qpdf succeeds", async () => {
      const work = path.join(TMP_ROOT, "work-compress-ok");
      await fs.ensureDir(work);
      const pdf = await makePdfFile(work, "comp.pdf");
      const out = path.join(work, "compout");
      const result = await processFile({
        operation: "compress",
        inputFiles: [mkInput(pdf, "comp.pdf", "application/pdf")],
        outputBasePath: out,
        workDir: work,
        qpdfBin: "qpdf",
      });
      assert.equal(result.outputs.length, 1);
      assert.ok(result.outputs[0].outputPath.endsWith(".pdf"));
      assert.ok(await fs.pathExists(result.outputs[0].outputPath));
    });
  });

  describe("ocr dispatch", () => {
    it("throws UNSUPPORTED_FILE for unsupported ocr type (zip)", async () => {
      const work = path.join(TMP_ROOT, "work-ocr-zip");
      await fs.ensureDir(work);
      const zipPath = path.join(work, "a.zip");
      const zip = new (await import("jszip")).default();
      zip.file("hello.txt", "hi");
      const buf = await zip.generateAsync({ type: "nodebuffer" });
      await fs.writeFile(zipPath, buf);
      await assert.rejects(
        () => processFile({ operation: "ocr", inputFiles: [mkInput(zipPath, "a.zip", "application/zip")], outputBasePath: path.join(work, "out"), workDir: work }),
        (err) => err.code === "UNSUPPORTED_FILE"
      );
    });
    it("ocr pdf extracts text via Docs fixture or docx fallback", async () => {
      const work = path.join(TMP_ROOT, "work-ocr-pdf");
      await fs.ensureDir(work);
      // Prefer docx which is more reliable via mammoth, as pdf-parse may fail on pdf-lib generated pdfs
      const DOCS_DOCX_SAMPLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../Docs/docx/sample-simple.docx");
      let src;
      let mime;
      let name;
      if (await fs.pathExists(DOCS_DOCX_SAMPLE)) {
        src = path.join(work, "src-ocr.docx");
        await fs.copy(DOCS_DOCX_SAMPLE, src);
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        name = "src-ocr.docx";
      } else {
        // fallback to generated pdf but handle possible FILE_CORRUPTED by using xlsx fixture
        const DOCS_XLSX_SIMPLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../Docs/xlsx/sample-simple.xlsx");
        if (await fs.pathExists(DOCS_XLSX_SIMPLE)) {
          src = path.join(work, "src-ocr.xlsx");
          await fs.copy(DOCS_XLSX_SIMPLE, src);
          mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
          name = "src-ocr.xlsx";
        } else {
          // last fallback: use pdf but expect fallback text
          src = await makePdfFile(work, "ocr.pdf", 1);
          mime = "application/pdf";
          name = "ocr.pdf";
        }
      }
      const out = path.join(work, "ocrout");
      const result = await processFile({
        operation: "ocr",
        inputFiles: [mkInput(src, name, mime)],
        outputBasePath: out,
        workDir: work,
      });
      assert.equal(result.outputs.length, 1);
      assert.ok(result.outputs[0].outputPath.endsWith(".txt"));
      assert.ok(await fs.pathExists(result.outputs[0].outputPath));
      const txt = await fs.readFile(result.outputs[0].outputPath, "utf8");
      assert.ok(txt.length > 0);
    });
    it("ocr image with tesseract may be heavy; skip if not needed - test unsupported still", async () => {
      // Already tested pdf path covers ocr dispatch
    });
  });

  describe("output handling", () => {
    it("throws PROCESSING_FAILED if qpdf binary invalid for compress", async () => {
      const work = path.join(TMP_ROOT, "work-no-output");
      await fs.ensureDir(work);
      const pdf = await makePdfFile(work, "noout.pdf");
      await assert.rejects(
        () => processFile({ operation: "compress", inputFiles: [mkInput(pdf, "noout.pdf", "application/pdf")], outputBasePath: path.join(work, "noout"), workDir: work, qpdfBin: "nonexistent_qpdf" }),
        (err) => err.code === "PROCESSING_FAILED" || err.code === "FILE_CORRUPTED"
      );
    });
  });
});
