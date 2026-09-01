import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getExtension,
  normalizeTargetFormat,
  detectFileType,
  isAllowedUpload,
  isValidOperation,
  isValidConversion,
} from "../../../utils/helpers/fileType.js";
import {
  MIME_BY_EXTENSION,
  SUPPORTED_EXTENSIONS,
  OPERATION_MODES,
  CONVERSION_TARGETS,
} from "../../../utils/constants.js";

describe("fileType helpers", () => {
  describe("getExtension", () => {
    it("lowercases extension", () => {
      assert.equal(getExtension("doc.PDF"), ".pdf");
      assert.equal(getExtension("image.JPG"), ".jpg");
      assert.equal(getExtension("archive.ZIP"), ".zip");
    });
    it("handles multiple dots and picks last", () => {
      assert.equal(getExtension("my.file.docx"), ".docx");
      assert.equal(getExtension("a.b.c.png"), ".png");
    });
    it("returns empty for no extension", () => {
      assert.equal(getExtension("README"), "");
      assert.equal(getExtension(""), "");
      assert.equal(getExtension(null), "");
      assert.equal(getExtension(undefined), "");
    });
    it("handles dot prefix correctly", () => {
      assert.equal(getExtension(".hiddenfile"), "");
      assert.equal(getExtension("file."), ".");
    });
    it("trims path handling via extname: handles windows style", () => {
      assert.equal(getExtension("folder/sub/file.pdf"), ".pdf");
    });
  });

  describe("normalizeTargetFormat", () => {
    it("lowercases and trims", () => {
      assert.equal(normalizeTargetFormat(" PDF "), "pdf");
      assert.equal(normalizeTargetFormat("DOCX"), "docx");
      assert.equal(normalizeTargetFormat(" JpG "), "jpg");
    });
    it("removes leading dot", () => {
      assert.equal(normalizeTargetFormat(".pdf"), "pdf");
      assert.equal(normalizeTargetFormat("..pdf"), ".pdf"); // only first dot removed per impl
      assert.equal(normalizeTargetFormat(".DOCX"), "docx");
    });
    it("returns empty for falsy", () => {
      assert.equal(normalizeTargetFormat(""), "");
      assert.equal(normalizeTargetFormat(null), "");
      assert.equal(normalizeTargetFormat(undefined), "");
    });
  });

  describe("detectFileType", () => {
    it("detects allowed pdf with correct mime", () => {
      const res = detectFileType("sample.pdf", "application/pdf");
      assert.ok(res);
      assert.equal(res.extension, ".pdf");
      assert.equal(res.kind, "pdf");
      assert.equal(res.mimeType, "application/pdf");
    });
    it("detects docx with correct mime", () => {
      const res = detectFileType("letter.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      assert.ok(res);
      assert.equal(res.extension, ".docx");
      assert.equal(res.kind, "docx");
    });
    it("detects xlsx", () => {
      const res = detectFileType("book.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      assert.ok(res);
      assert.equal(res.extension, ".xlsx");
    });
    it("detects pptx", () => {
      const res = detectFileType("deck.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      assert.ok(res);
      assert.equal(res.extension, ".pptx");
    });
    it("detects jpg/jpeg/png image kinds", () => {
      assert.equal(detectFileType("photo.jpg", "image/jpeg").kind, "image");
      assert.equal(detectFileType("photo.jpeg", "image/jpeg").kind, "image");
      assert.equal(detectFileType("icon.png", "image/png").kind, "image");
    });
    it("detects zip with allowed mime variants", () => {
      assert.ok(detectFileType("archive.zip", "application/zip"));
      assert.ok(detectFileType("archive.zip", "application/x-zip-compressed"));
      assert.ok(detectFileType("archive.zip", "multipart/x-zip"));
    });
    it("allows application/octet-stream fallback for any supported extension", () => {
      for (const ext of SUPPORTED_EXTENSIONS) {
        const res = detectFileType(`file${ext}`, "application/octet-stream");
        assert.ok(res, `should allow octet-stream for ${ext}`);
        assert.equal(res.extension, ext);
      }
    });
    it("allows octet-stream case-insensitive", () => {
      const res = detectFileType("file.pdf", "Application/Octet-Stream");
      assert.ok(res);
    });
    it("allows missing mime (no mime) as valid", () => {
      assert.ok(detectFileType("file.pdf", ""));
      assert.ok(detectFileType("file.pdf", null));
      assert.ok(detectFileType("file.pdf", undefined));
      assert.equal(detectFileType("file.pdf", null).extension, ".pdf");
    });
    it("returns null for unsupported extension", () => {
      assert.equal(detectFileType("notes.txt", "text/plain"), null);
      assert.equal(detectFileType("script.js", "application/javascript"), null);
      assert.equal(detectFileType("archive.rar", "application/x-rar-compressed"), null);
      assert.equal(detectFileType("file.pdf", "application/pdf").extension, ".pdf"); // sanity
      assert.equal(detectFileType("file.unknown", "application/octet-stream"), null);
    });
    it("returns null for mismatched mime", () => {
      assert.equal(detectFileType("file.pdf", "image/jpeg"), null);
      assert.equal(detectFileType("file.docx", "application/pdf"), null);
      assert.equal(detectFileType("file.png", "application/pdf"), null);
      assert.equal(detectFileType("file.zip", "image/jpeg"), null);
    });
    it("is case-insensitive for extension and mime", () => {
      assert.ok(detectFileType("FILE.PDF", "APPLICATION/PDF"));
      assert.ok(detectFileType("FILE.DocX", "Application/Vnd.Openxmlformats-Officedocument.Wordprocessingml.Document"));
    });
    it("returns null for empty filename", () => {
      assert.equal(detectFileType("", "application/pdf"), null);
      assert.equal(detectFileType(null, "application/pdf"), null);
    });
    it("handles mime with charset? currently strict, should be null", () => {
      // MIME_BY_EXTENSION does not include charset variant, so should be null unless octet-stream
      assert.equal(detectFileType("file.pdf", "application/pdf; charset=utf-8"), null);
    });
    it("verifies SUPPORTED_EXTENSIONS matches MIME_BY_EXTENSION keys", () => {
      assert.deepEqual(new Set(SUPPORTED_EXTENSIONS), new Set(Object.keys(MIME_BY_EXTENSION)));
    });
  });

  describe("isAllowedUpload", () => {
    it("true for supported file+mimes", () => {
      assert.equal(isAllowedUpload("a.pdf", "application/pdf"), true);
      assert.equal(isAllowedUpload("a.zip", "application/zip"), true);
      assert.equal(isAllowedUpload("a.png", "image/png"), true);
    });
    it("true for octet-stream fallback", () => {
      assert.equal(isAllowedUpload("a.pdf", "application/octet-stream"), true);
      assert.equal(isAllowedUpload("a.docx", "application/octet-stream"), true);
    });
    it("true for missing mime", () => {
      assert.equal(isAllowedUpload("a.pdf", ""), true);
      assert.equal(isAllowedUpload("a.pdf", null), true);
    });
    it("false for unsupported", () => {
      assert.equal(isAllowedUpload("a.txt", "text/plain"), false);
      assert.equal(isAllowedUpload("a.pdf", "image/jpeg"), false);
      assert.equal(isAllowedUpload("", "application/pdf"), false);
    });
  });

  describe("isValidOperation", () => {
    it("accepts each OPERATION_MODES value case-insensitive", () => {
      for (const op of OPERATION_MODES) {
        assert.equal(isValidOperation(op), true, op);
        assert.equal(isValidOperation(op.toUpperCase()), true, op.toUpperCase());
        assert.equal(isValidOperation(op.charAt(0).toUpperCase() + op.slice(1)), true);
      }
    });
    it("rejects invalid operations", () => {
      assert.equal(isValidOperation("invalid"), false);
      assert.equal(isValidOperation(""), false);
      assert.equal(isValidOperation(null), false);
      assert.equal(isValidOperation(undefined), false);
      assert.equal(isValidOperation("unlock "), false); // not trimmed lowercased with space? impl does (operation||"").toLowerCase() no trim, so "unlock " false
      assert.equal(isValidOperation("  "), false);
    });
    it("explicitly contains unlock|convert|merge|split|ocr|rotate|compress", () => {
      const expected = ["unlock", "convert", "merge", "split", "ocr", "rotate", "compress"];
      for (const e of expected) assert.equal(OPERATION_MODES.has(e), true);
      assert.equal(OPERATION_MODES.size, expected.length);
    });
  });

  describe("isValidConversion", () => {
    it("validates conversion pairs from CONVERSION_TARGETS", () => {
      assert.equal(isValidConversion(".pdf", "docx"), true);
      assert.equal(isValidConversion(".pdf", "pptx"), true);
      assert.equal(isValidConversion(".docx", "pdf"), true);
      assert.equal(isValidConversion(".png", "jpg"), true);
      assert.equal(isValidConversion(".jpg", "pdf"), true);
      assert.equal(isValidConversion(".xlsx", "csv"), true);
    });
    it("case-insensitive and dot handling", () => {
      assert.equal(isValidConversion(".pdf", ".docx"), true);
      assert.equal(isValidConversion(".pdf", "DOCX"), true);
      assert.equal(isValidConversion(".docx", ".PDF"), true);
    });
    it("trims whitespace", () => {
      assert.equal(isValidConversion(".pdf", " docx "), true);
    });
    it("rejects invalid pairs", () => {
      assert.equal(isValidConversion(".pdf", "zip"), false);
      assert.equal(isValidConversion(".pdf", "exe"), false);
      assert.equal(isValidConversion(".png", "docx"), false);
      assert.equal(isValidConversion(".zip", "pdf"), false);
      assert.equal(isValidConversion(".txt", "pdf"), false);
      assert.equal(isValidConversion(".pdf", ""), false);
      assert.equal(isValidConversion(".pdf", null), false);
    });
    it("rejects unknown source extension", () => {
      assert.equal(isValidConversion(".unknown", "pdf"), false);
      assert.equal(isValidConversion("", "pdf"), false);
    });
    it("covers all defined targets", () => {
      for (const [src, targets] of Object.entries(CONVERSION_TARGETS)) {
        for (const t of targets) {
          assert.equal(isValidConversion(src, t), true, `${src} -> ${t}`);
        }
      }
    });
    it("boundary: empty target and undefined", () => {
      assert.equal(isValidConversion(".pdf", undefined), false);
      assert.equal(isValidConversion(".pdf", "   "), false);
    });
  });
});
