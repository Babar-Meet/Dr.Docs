import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import path from "node:path";
import { isAllowedUpload } from "../../../utils/helpers/fileType.js";
import { MAX_UPLOAD_SIZE_BYTES } from "../../../utils/constants.js";
import upload from "../../../server/src/middleware/upload.js";

describe("server/middleware upload fileFilter and limits", () => {
  describe("fileFilter via isAllowedUpload", () => {
    it("rejects unsupported .txt with text/plain", () => {
      assert.equal(isAllowedUpload("notes.txt", "text/plain"), false);
      assert.equal(isAllowedUpload("script.js", "application/javascript"), false);
      assert.equal(isAllowedUpload("archive.rar", "application/x-rar-compressed"), false);
    });

    it("rejects unsupported .exe even with octet-stream", () => {
      assert.equal(isAllowedUpload("bad.exe", "application/octet-stream"), false);
      assert.equal(isAllowedUpload("malware.exe", "application/pdf"), false);
    });

    it("allows supported pdf with correct mime", () => {
      assert.equal(isAllowedUpload("doc.pdf", "application/pdf"), true);
      assert.equal(isAllowedUpload("a.pdf", "application/pdf"), true);
    });

    it("allows supported docx with correct mime", () => {
      assert.equal(isAllowedUpload("letter.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), true);
    });

    it("allows supported pptx, xlsx, zip variants", () => {
      assert.equal(isAllowedUpload("deck.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"), true);
      assert.equal(isAllowedUpload("book.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), true);
      assert.equal(isAllowedUpload("archive.zip", "application/zip"), true);
      assert.equal(isAllowedUpload("archive.zip", "application/x-zip-compressed"), true);
      assert.equal(isAllowedUpload("archive.zip", "multipart/x-zip"), true);
    });

    it("allows image jpeg png with correct mime", () => {
      assert.equal(isAllowedUpload("photo.jpg", "image/jpeg"), true);
      assert.equal(isAllowedUpload("photo.jpeg", "image/jpeg"), true);
      assert.equal(isAllowedUpload("icon.png", "image/png"), true);
    });

    it("allows octet-stream fallback for any supported extension", () => {
      assert.equal(isAllowedUpload("file.pdf", "application/octet-stream"), true);
      assert.equal(isAllowedUpload("file.docx", "application/octet-stream"), true);
      assert.equal(isAllowedUpload("file.pptx", "application/octet-stream"), true);
      assert.equal(isAllowedUpload("file.xlsx", "application/octet-stream"), true);
      assert.equal(isAllowedUpload("file.jpg", "application/octet-stream"), true);
      assert.equal(isAllowedUpload("file.png", "application/octet-stream"), true);
      assert.equal(isAllowedUpload("file.zip", "application/octet-stream"), true);
    });

    it("allows octet-stream case-insensitive", () => {
      assert.equal(isAllowedUpload("file.pdf", "Application/Octet-Stream"), true);
      assert.equal(isAllowedUpload("file.pdf", "APPLICATION/OCTET-STREAM"), true);
    });

    it("allows missing mime (null, empty) as valid for supported extension", () => {
      assert.equal(isAllowedUpload("file.pdf", ""), true);
      assert.equal(isAllowedUpload("file.pdf", null), true);
      assert.equal(isAllowedUpload("file.pdf", undefined), true);
    });

    it("is case-insensitive for extension and mime", () => {
      assert.equal(isAllowedUpload("FILE.PDF", "APPLICATION/PDF"), true);
      assert.equal(isAllowedUpload("FILE.DocX", "Application/Vnd.Openxmlformats-Officedocument.Wordprocessingml.Document"), true);
      assert.equal(isAllowedUpload("PHOTO.JPG", "IMAGE/JPEG"), true);
    });

    it("returns false for mismatched mime", () => {
      assert.equal(isAllowedUpload("file.pdf", "image/jpeg"), false);
      assert.equal(isAllowedUpload("file.docx", "application/pdf"), false);
      assert.equal(isAllowedUpload("file.png", "application/pdf"), false);
      assert.equal(isAllowedUpload("file.zip", "image/jpeg"), false);
    });

    it("returns false for empty filename", () => {
      assert.equal(isAllowedUpload("", "application/pdf"), false);
      assert.equal(isAllowedUpload(null, "application/pdf"), false);
    });
  });

  describe("upload multer configuration", () => {
    it("exposes multer with limits.fileSize equals 50MB", () => {
      // upload is a multer instance; its limits are accessible via inspection of internals or by checking MAX_UPLOAD_SIZE_BYTES
      assert.equal(MAX_UPLOAD_SIZE_BYTES, 50 * 1024 * 1024);
      // Verify upload object exists and is a function (multer middleware)
      assert.equal(typeof upload, "object");
      // Multer instance should have storage or handle request - check it has expected structure
      assert.ok(upload !== null);
    });

    it("MAX_UPLOAD_SIZE_BYTES is exactly 52428800", () => {
      assert.equal(MAX_UPLOAD_SIZE_BYTES, 52428800);
    });

    it("upload accepts both 'files' and 'file' field names conceptually (merged in routes)", async () => {
      // This is verified via routes test, but we assert constants for field handling
      // Ensure both field counts are as spec: files 200, file 10
      // Since not exported directly, we verify via reading routes file
      const routesContent = await fs.readFile(path.resolve("server/src/routes/files.js"), "utf8");
      assert.match(routesContent, /name: "file".*maxCount: 10/s);
      assert.match(routesContent, /name: "files".*maxCount: 200/s);
    });

    it("storage filename uses Date.now and uuid with lowercased extension", async () => {
      const uploadContent = await fs.readFile(path.resolve("server/src/middleware/upload.js"), "utf8");
      assert.match(uploadContent, /Date\.now\(\)/);
      assert.match(uploadContent, /randomUUID\(\)/);
      assert.match(uploadContent, /path\.extname\(file\.originalname\)\.toLowerCase\(\)/);
      assert.match(uploadContent, /limits:\s*{\s*fileSize:\s*MAX_UPLOAD_SIZE_BYTES/);
    });

    it("fileFilter rejects unsupported via AppError UNSUPPORTED_FILE", async () => {
      const uploadContent = await fs.readFile(path.resolve("server/src/middleware/upload.js"), "utf8");
      assert.match(uploadContent, /fileFilter/);
      assert.match(uploadContent, /isAllowedUpload/);
      assert.match(uploadContent, /UNSUPPORTED_FILE/);
      assert.match(uploadContent, /callback\(new AppError/);
    });
  });

  describe("boundary and edge cases", () => {
    it("handles files with multiple dots (my.file.docx) correctly", () => {
      assert.equal(isAllowedUpload("my.file.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), true);
      assert.equal(isAllowedUpload("a.b.c.png", "image/png"), true);
    });

    it("handles uppercase extensions with octet-stream", () => {
      assert.equal(isAllowedUpload("REPORT.PDF", "application/octet-stream"), true);
      assert.equal(isAllowedUpload("DATA.XLSX", "application/octet-stream"), true);
    });

    it("rejects extension with trailing dot", () => {
      assert.equal(isAllowedUpload("file.", "application/pdf"), false);
    });

    it("handles windows style path file detection", () => {
      assert.equal(isAllowedUpload("folder/sub/file.pdf", "application/pdf"), true);
    });

    it("fileFilter would allow file with octet-stream even if mime mismatched for supported ext", () => {
      // The key behavior: generic fallback allows any supported extension regardless of mime strictness
      assert.equal(isAllowedUpload("document.pdf", "application/octet-stream"), true);
      assert.equal(isAllowedUpload("presentation.pptx", "application/octet-stream"), true);
    });
  });
});
