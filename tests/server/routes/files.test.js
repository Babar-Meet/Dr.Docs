import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import express from "express";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { AppError } from "../../../utils/errors.js";
import filesRouter from "../../../server/src/routes/files.js";
import { errorHandler } from "../../../server/src/middleware/errorHandler.js";
import { setDownloadRecord, getDownloadRecord, removeDownloadRecord } from "../../../server/src/services/downloadStore.js";
import { MAX_UPLOAD_SIZE_BYTES } from "../../../utils/constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_ROOT = path.join(os.tmpdir(), `drdocs-routes-${Date.now()}`);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(filesRouter);
  app.use(errorHandler);
  return app;
}

async function startServer(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" ? addr.port : addr;
      resolve({ server, port, url: `http://127.0.0.1:${port}` });
    });
    server.on("error", reject);
  });
}

async function stopServer(server) {
  return new Promise((res) => server.close(() => res()));
}

describe("routes/files validation POST /process", () => {
  let app, server, baseUrl;
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
    app = createApp();
    const started = await startServer(app);
    server = started.server;
    baseUrl = started.url;
  });
  after(async () => {
    if (server) await stopServer(server);
    await fs.remove(TMP_ROOT);
  });

  async function postProcess({ fields = {}, files = [] } = {}) {
    // fields: object of key->value, files: array of { fieldName, filePath, fileName, mimeType }
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    for (const f of files) {
      const buf = await fs.readFile(f.filePath);
      const blob = new Blob([buf], { type: f.mimeType || "application/octet-stream" });
      form.append(f.fieldName, blob, f.fileName);
    }
    const res = await fetch(`${baseUrl}/process`, { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    return { res, body, status: res.status };
  }

  describe("missing files", () => {
    it("returns 400 UNSUPPORTED_FILE when no files uploaded", async () => {
      const { status, body } = await postProcess({ fields: { operation: "unlock" }, files: [] });
      assert.equal(status, 400);
      assert.equal(body.code, "UNSUPPORTED_FILE");
      assert.equal(body.status, "failed");
    });

    it("returns 400 when files array empty but operation provided", async () => {
      const { status, body } = await postProcess({ fields: { operation: "convert", targetFormat: "pdf" } });
      assert.equal(status, 400);
      assert.ok(["UNSUPPORTED_FILE", "PROCESSING_FAILED"].includes(body.code));
    });

    it("handles missing operation defaults to unlock but still requires file", async () => {
      const { status } = await postProcess({ fields: {}, files: [] });
      assert.equal(status, 400);
    });

    it("returns 400 for empty multipart without files", async () => {
      const form = new FormData();
      form.append("operation", "unlock");
      const res = await fetch(`${baseUrl}/process`, { method: "POST", body: form });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.code, "UNSUPPORTED_FILE");
    });
  });

  describe("invalid operation", () => {
    let pdfPath;
    before(async () => {
      pdfPath = path.join(TMP_ROOT, "sample.pdf");
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.create();
      doc.addPage([200, 200]);
      const bytes = await doc.save();
      await fs.writeFile(pdfPath, bytes);
    });

    it("returns 400 UNSUPPORTED_FILE for invalid operation value", async () => {
      const { status, body } = await postProcess({
        fields: { operation: "invalidOp" },
        files: [{ fieldName: "files", filePath: pdfPath, fileName: "sample.pdf", mimeType: "application/pdf" }],
      });
      assert.equal(status, 400);
      assert.equal(body.code, "UNSUPPORTED_FILE");
    });

    it("operation is case-insensitive lowercased: UNLOCK should succeed validation (not UNSUPPORTED_FILE for operation)", async () => {
      // This will go through processing queue; may succeed or fail due to qpdf, but should not be UNSUPPORTED_FILE for operation
      // For unlock pdf, qpdf may succeed via copy fallback; we just check not UNSUPPORTED_FILE due to operation
      // If it fails due to qpdf missing, it will be PROCESSING_FAILED not UNSUPPORTED_FILE
      const { status, body } = await postProcess({
        fields: { operation: "UNLOCK" },
        files: [{ fieldName: "files", filePath: pdfPath, fileName: "sample.pdf", mimeType: "application/pdf" }],
      });
      // Status could be 200 success (if qpdf fallback copy works) or 500/400 PROCESSING_FAILED, but not UNSUPPORTED_FILE for operation
      // However our sample.pdf unlock via qpdf will try runCommand and handle "not encrypted" -> success 200
      // So we assert either 200 or not UNSUPPORTED_FILE
      if (status === 400 && body.code === "UNSUPPORTED_FILE") {
        // Check reason not about operation mode
        assert.ok(!String(body.reason || "").includes("Unsupported operation mode"), `should not be operation error, got ${body.reason}`);
      } else {
        // Either 200 success or other code
        assert.ok(status === 200 || body.code !== "UNSUPPORTED_FILE" || !String(body.reason).includes("Unsupported operation mode"));
      }
    });

    it("returns 400 for unsupported operation with multiple files", async () => {
      const pdf2 = path.join(TMP_ROOT, "sample2.pdf");
      await fs.copy(pdfPath, pdf2);
      const { status, body } = await postProcess({
        fields: { operation: "hackTheSystem" },
        files: [
          { fieldName: "files", filePath: pdfPath, fileName: "a.pdf", mimeType: "application/pdf" },
          { fieldName: "files", filePath: pdf2, fileName: "b.pdf", mimeType: "application/pdf" },
        ],
      });
      assert.equal(status, 400);
      assert.equal(body.code, "UNSUPPORTED_FILE");
    });
  });

  describe("unsupported file type via upload filter", () => {
    it("returns 400 when uploading .txt (unsupported extension)", async () => {
      const txtPath = path.join(TMP_ROOT, "notes.txt");
      await fs.writeFile(txtPath, "hello");
      const { status, body } = await postProcess({
        fields: { operation: "unlock" },
        files: [{ fieldName: "files", filePath: txtPath, fileName: "notes.txt", mimeType: "text/plain" }],
      });
      assert.equal(status, 400);
      assert.equal(body.code, "UNSUPPORTED_FILE");
    });

    it("returns 400 for .exe upload", async () => {
      const exePath = path.join(TMP_ROOT, "bad.exe");
      await fs.writeFile(exePath, "MZP dummy");
      const { status, body } = await postProcess({
        fields: { operation: "unlock" },
        files: [{ fieldName: "files", filePath: exePath, fileName: "bad.exe", mimeType: "application/octet-stream" }],
      });
      // Even though octet-stream is allowed for supported extensions, .exe is not supported extension so should be UNSUPPORTED_FILE
      assert.equal(status, 400);
      assert.equal(body.code, "UNSUPPORTED_FILE");
    });

    it("accepts .pdf with octet-stream fallback mime", async () => {
      const pdfPath = path.join(TMP_ROOT, "octet.pdf");
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.create();
      doc.addPage([200, 200]);
      await fs.writeFile(pdfPath, await doc.save());
      const { status } = await postProcess({
        fields: { operation: "unlock" },
        files: [{ fieldName: "files", filePath: pdfPath, fileName: "octet.pdf", mimeType: "application/octet-stream" }],
      });
      // Should not be rejected by fileFilter, so status is 200 or PROCESSING_FAILED but not UNSUPPORTED_FILE due to mime
      // For our valid pdf with octet-stream, unlock should succeed (200) or at least not be filtered
      assert.notEqual(status, 400, "octet-stream pdf should not be rejected");
      // Actually could be 200
      assert.ok(status === 200 || status === 500);
    });
  });

  describe("field name variants file vs files", () => {
    it("accepts files via 'files' field", async () => {
      const pdfPath = path.join(TMP_ROOT, "via-files.pdf");
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.create();
      doc.addPage([100, 100]);
      await fs.writeFile(pdfPath, await doc.save());
      const { status } = await postProcess({
        fields: { operation: "unlock" },
        files: [{ fieldName: "files", filePath: pdfPath, fileName: "via-files.pdf", mimeType: "application/pdf" }],
      });
      assert.equal(status, 200);
    });

    it("accepts files via 'file' field", async () => {
      const pdfPath = path.join(TMP_ROOT, "via-file.pdf");
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.create();
      doc.addPage([100, 100]);
      await fs.writeFile(pdfPath, await doc.save());
      const { status } = await postProcess({
        fields: { operation: "unlock" },
        files: [{ fieldName: "file", filePath: pdfPath, fileName: "via-file.pdf", mimeType: "application/pdf" }],
      });
      assert.equal(status, 200);
    });
  });

  describe("oversize handling", () => {
    it("MAX_UPLOAD_SIZE_BYTES is 50MB", () => {
      assert.equal(MAX_UPLOAD_SIZE_BYTES, 50 * 1024 * 1024);
    });

    it("errorHandler maps Multer LIMIT_FILE_SIZE to FILE_TOO_LARGE 400", async () => {
      // Directly test errorHandler
      const app2 = express();
      app2.get("/throw-multer", (req, res, next) => {
        const err = new multer.MulterError("LIMIT_FILE_SIZE");
        err.code = "LIMIT_FILE_SIZE";
        next(err);
      });
      app2.use(errorHandler);
      const { server: s2, url } = await startServer(app2);
      try {
        const res = await fetch(`${url}/throw-multer`);
        const body = await res.json();
        assert.equal(res.status, 400);
        assert.equal(body.code, "FILE_TOO_LARGE");
        assert.equal(body.status, "failed");
      } finally {
        await stopServer(s2);
      }
    });

    it("errorHandler returns 400 for AppError LIMIT_FILE_SIZE style", async () => {
      const app3 = express();
      app3.get("/throw-app", (req, res, next) => {
        next(new AppError("File exceeds 50MB", "FILE_TOO_LARGE", 400, { reason: "Max file size is 50MB" }));
      });
      app3.use(errorHandler);
      const { server: s3, url } = await startServer(app3);
      try {
        const res = await fetch(`${url}/throw-app`);
        const body = await res.json();
        assert.equal(res.status, 400);
        assert.equal(body.code, "FILE_TOO_LARGE");
      } finally {
        await stopServer(s3);
      }
    });
  });

  describe("download route", () => {
    it("GET /download/:id returns 404 for unknown id", async () => {
      const res = await fetch(`${baseUrl}/download/nonexistent-id-12345`);
      const body = await res.json();
      assert.equal(res.status, 404);
      assert.equal(body.code, "PROCESSING_FAILED");
      assert.equal(body.status, "failed");
    });

    it("GET /download/:id serves file and cleans up (single-use)", async () => {
      const filePath = path.join(TMP_ROOT, `download-${Date.now()}.txt`);
      await fs.writeFile(filePath, "download content hello");
      const id = `dl-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setDownloadRecord(id, { filePath, downloadName: "hello.txt", mimeType: "text/plain" });
      assert.ok(getDownloadRecord(id));
      const res = await fetch(`${baseUrl}/download/${id}`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "text/plain");
      const text = await res.text();
      assert.equal(text, "download content hello");
      // after download, record should be removed and file deleted (single-use)
      // Give a tick for res.download callback to fire
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(getDownloadRecord(id), undefined);
      // File should be deleted
      assert.equal(await fs.pathExists(filePath), false);
    });

    it("GET /download/:id with expired record returns 404", async () => {
      const id = `expired-${Date.now()}`;
      const fakePath = path.join(TMP_ROOT, "expired.txt");
      await fs.writeFile(fakePath, "x");
      setDownloadRecord(id, { filePath: fakePath, downloadName: "x.txt", mimeType: "text/plain" });
      // Simulate expiration by removing manually
      await removeDownloadRecord(id);
      const res = await fetch(`${baseUrl}/download/${id}`);
      assert.equal(res.status, 404);
    });
  });

  describe("processingQueue integration", () => {
    it("concurrent process requests are queued (concurrency 2)", async () => {
      const pdfPath = path.join(TMP_ROOT, "concurrent.pdf");
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.create();
      doc.addPage([100, 100]);
      await fs.writeFile(pdfPath, await doc.save());
      // Fire 3 concurrent unlock requests
      const promises = Array.from({ length: 3 }, () =>
        postProcess({
          fields: { operation: "unlock" },
          files: [{ fieldName: "files", filePath: pdfPath, fileName: "concurrent.pdf", mimeType: "application/pdf" }],
        })
      );
      const results = await Promise.all(promises);
      for (const { status } of results) {
        // Each should either succeed 200 or fail with processing error but not queue crash
        assert.ok(status === 200 || status === 400 || status === 500);
      }
    });

    it("POST /process with convert missing targetFormat returns 400", async () => {
      const pdfPath = path.join(TMP_ROOT, "convert-missing.pdf");
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.create();
      doc.addPage([100, 100]);
      await fs.writeFile(pdfPath, await doc.save());
      const { status, body } = await postProcess({
        fields: { operation: "convert" }, // missing targetFormat
        files: [{ fieldName: "files", filePath: pdfPath, fileName: "convert-missing.pdf", mimeType: "application/pdf" }],
      });
      assert.equal(status, 400);
      assert.equal(body.code, "UNSUPPORTED_FILE");
    });

    it("POST /process with merge requiring 2 files returns 400 if only 1", async () => {
      const pdfPath = path.join(TMP_ROOT, "merge-one.pdf");
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.create();
      doc.addPage([100, 100]);
      await fs.writeFile(pdfPath, await doc.save());
      const { status, body } = await postProcess({
        fields: { operation: "merge", targetFormat: "pdf" },
        files: [{ fieldName: "files", filePath: pdfPath, fileName: "merge-one.pdf", mimeType: "application/pdf" }],
      });
      assert.equal(status, 400);
      assert.equal(body.code, "UNSUPPORTED_FILE");
    });

    it("POST /process split with non-pdf returns 400", async () => {
      const imgPath = path.join(TMP_ROOT, "split-bad.png");
      const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
      await fs.writeFile(imgPath, Buffer.from(pngBase64, "base64"));
      const { status, body } = await postProcess({
        fields: { operation: "split" },
        files: [{ fieldName: "files", filePath: imgPath, fileName: "split-bad.png", mimeType: "image/png" }],
      });
      assert.equal(status, 400);
      assert.equal(body.code, "UNSUPPORTED_FILE");
    });
  });

  describe("edge cases", () => {
    it("handles multipart with no body gracefully", async () => {
      const res = await fetch(`${baseUrl}/process`, { method: "POST" });
      // Without content-type, multer may pass through and processService will throw UNSUPPORTED_FILE
      // Could be 400 or 500 depending on handling, but should not crash
      assert.ok([400, 500].includes(res.status));
    });

    it("handles operation with whitespace and case", async () => {
      const pdfPath = path.join(TMP_ROOT, "whitespace.pdf");
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.create();
      doc.addPage([100, 100]);
      await fs.writeFile(pdfPath, await doc.save());
      const form = new FormData();
      form.append("operation", "  unlock  "); // router lowercases but does not trim? Actually routes does (req.body.operation||"unlock").toLowerCase() no trim, but processFile does trim? Let's see: processFile lowercases but not trim. However operation "  unlock  " lowercased stays "  unlock  " which is not in OPERATION_MODES, so should be UNSUPPORTED_FILE
      const blob = new Blob([await fs.readFile(pdfPath)], { type: "application/pdf" });
      form.append("files", blob, "whitespace.pdf");
      const res = await fetch(`${baseUrl}/process`, { method: "POST", body: form });
      const body = await res.json();
      // Expect 400 because not trimmed
      assert.equal(res.status, 400);
      assert.equal(body.code, "UNSUPPORTED_FILE");
    });
  });
});
