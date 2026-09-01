import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import JSZip from "jszip";
import { fileURLToPath } from "node:url";
import { AppError } from "../../../utils/errors.js";
import { SECURE_ENCRYPTION_MESSAGE } from "../../../utils/constants.js";
import { unlockDocxRestrictions, unlockPptxRestrictions, normalizeOfficeDocument } from "../../../utils/processors/officeProcessor.js";

const DOCS_DOCX_SIMPLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../Docs/docx/sample-simple.docx");
const DOCS_PPTX_SIMPLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../Docs/pptx/sample-simple.pptx");
const TMP_ROOT = path.join(os.tmpdir(), `drdocs-office-${Date.now()}`);

describe("officeProcessor security boundary", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });
  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  async function createProtectedDocx(dir, name = "protected.docx") {
    // Copy simple and add protection tag if exists, else create minimal protected structure
    const target = path.join(dir, name);
    if (await fs.pathExists(DOCS_DOCX_SIMPLE)) {
      // Load and inject protection to simulate protected docx that should still be unlockable (not encrypted)
      const buf = await fs.readFile(DOCS_DOCX_SIMPLE);
      const zip = await JSZip.loadAsync(buf);
      const settingsPath = "word/settings.xml";
      let xml = await zip.file(settingsPath)?.async("string") || `<?xml version="1.0"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:documentProtection w:edit="readOnly" w:enforcement="1"/></w:settings>`;
      // ensure protection exists
      if (!xml.includes("documentProtection")) {
        xml = xml.replace("</w:settings>", `<w:documentProtection w:edit="readOnly" w:enforcement="1"/><w:writeProtection/></w:settings>`);
      }
      zip.file(settingsPath, xml);
      const outBuf = await zip.generateAsync({ type: "nodebuffer" });
      await fs.writeFile(target, outBuf);
      return target;
    } else {
      // minimal docx with required entries
      const zip = new JSZip();
      zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types/>`);
      zip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
      zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>hello</w:t></w:r></w:p></w:body></w:document>`);
      zip.file("word/_rels/document.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
      zip.file("word/settings.xml", `<?xml version="1.0"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:documentProtection w:edit="readOnly" w:enforcement="1"/></w:settings>`);
      zip.file("docProps/core.xml", `<?xml version="1.0"?><cp:coreProperties/>`);
      const buf = await zip.generateAsync({ type: "nodebuffer" });
      await fs.writeFile(target, buf);
      return target;
    }
  }

  describe("DOCX PASSWORD_REQUIRED via OLE header", () => {
    it("throws PASSWORD_REQUIRED when file starts with OLE signature", async () => {
      const work = path.join(TMP_ROOT, "ole-docx");
      await fs.ensureDir(work);
      const olePath = path.join(work, "encrypted.docx");
      const oleSig = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);
      await fs.writeFile(olePath, Buffer.concat([oleSig, Buffer.from("fake ole content")])); 
      const out = path.join(work, "out.docx");
      await assert.rejects(
        () => unlockDocxRestrictions({ inputPath: olePath, outputPath: out }),
        (err) => {
          assert.ok(err instanceof AppError);
          assert.equal(err.code, "PASSWORD_REQUIRED");
          assert.equal(err.message, SECURE_ENCRYPTION_MESSAGE);
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    });

    it("throws PASSWORD_REQUIRED via OLE for PPTX as well", async () => {
      const work = path.join(TMP_ROOT, "ole-pptx");
      await fs.ensureDir(work);
      const olePath = path.join(work, "encrypted.pptx");
      const oleSig = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
      await fs.writeFile(olePath, oleSig);
      const out = path.join(work, "out.pptx");
      await assert.rejects(
        () => unlockPptxRestrictions({ inputPath: olePath, outputPath: out }),
        (err) => err.code === "PASSWORD_REQUIRED" && err.message === SECURE_ENCRYPTION_MESSAGE
      );
    });

    it("throws PASSWORD_REQUIRED even with truncated OLE + extra data via docx", async () => {
      const work = path.join(TMP_ROOT, "ole-trunc");
      await fs.ensureDir(work);
      const p = path.join(work, "file.docx");
      const sig = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
      await fs.writeFile(p, Buffer.concat([sig, Buffer.alloc(100, 0xFF)]));
      const out = path.join(work, "out.docx");
      await assert.rejects(() => unlockDocxRestrictions({ inputPath: p, outputPath: out }), (err) => err.code === "PASSWORD_REQUIRED");
    });
  });

  describe("JSZip password-related errors map to PASSWORD_REQUIRED", () => {
    it("throws PASSWORD_REQUIRED when JSZip load throws password error", async () => {
      const work = path.join(TMP_ROOT, "jszip-pwd");
      await fs.ensureDir(work);
      // Create a normal file then mock JSZip.loadAsync to throw password error
      const fakePath = path.join(work, "fake.docx");
      await fs.writeFile(fakePath, Buffer.from([0x50, 0x4b, 0x03, 0x04])); // zip magic but truncated
      const out = path.join(work, "out.docx");
      const stub = mock.method(JSZip, "loadAsync", async () => { throw new Error("File is encrypted with password"); });
      try {
        await assert.rejects(
          () => unlockDocxRestrictions({ inputPath: fakePath, outputPath: out }),
          (err) => err.code === "PASSWORD_REQUIRED" && err.message === SECURE_ENCRYPTION_MESSAGE
        );
      } finally {
        stub.mock.restore();
      }
    });

    it("throws FILE_CORRUPTED for generic JSZip error without password keyword", async () => {
      const work = path.join(TMP_ROOT, "jszip-corrupt");
      await fs.ensureDir(work);
      const badPath = path.join(work, "bad.docx");
      await fs.writeFile(badPath, Buffer.from("not a zip at all"));
      const out = path.join(work, "out.docx");
      // Without stub, JSZip.loadAsync will throw, and officeProcessor should map to FILE_CORRUPTED if not password related
      await assert.rejects(
        () => unlockDocxRestrictions({ inputPath: badPath, outputPath: out }),
        (err) => err.code === "FILE_CORRUPTED"
      );
    });

    it("mammoth password error also maps to PASSWORD_REQUIRED", async () => {
      // Create a docx that will trigger mammoth extractRawText to throw password
      // We can stub mammoth by mocking file read? Simpler: mock JSZip and ensure mammoth throws
      // But unlockDocxRestrictions calls validateDocxReadable -> mammoth.extractRawText
      // We can stub mammoth module
      const work = path.join(TMP_ROOT, "mammoth-pwd");
      await fs.ensureDir(work);
      const p = path.join(work, "a.docx");
      await fs.writeFile(p, Buffer.from("fake"));
      const mammothMod = await import("mammoth");
      const stub = mock.method(mammothMod.default || mammothMod, "extractRawText", async () => { throw new Error("Encrypted document requires password"); });
      // Need to handle that mammoth is imported as `mammoth` default; the mock may target correct object
      // Try also stubbing the default export if needed
      try {
        const out = path.join(work, "out.docx");
        await assert.rejects(
          () => unlockDocxRestrictions({ inputPath: p, outputPath: out }),
          (err) => err.code === "PASSWORD_REQUIRED"
        );
      } finally {
        stub.mock.restore();
      }
    });
  });

  describe("successful unlock (non-encrypted) should produce output", () => {
    it("unlockDocxRestrictions removes protection and writes output (fixture)", async () => {
      const work = path.join(TMP_ROOT, "docx-success");
      await fs.ensureDir(work);
      const src = await createProtectedDocx(work, "in.docx");
      const out = path.join(work, "out.docx");
      await assert.doesNotReject(() => unlockDocxRestrictions({ inputPath: src, outputPath: out }));
      assert.ok(await fs.pathExists(out));
      // Verify protection removed
      const outBuf = await fs.readFile(out);
      const zip = await JSZip.loadAsync(outBuf);
      const settings = await zip.file("word/settings.xml")?.async("string") || "";
      assert.equal(settings.includes("documentProtection"), false, "documentProtection should be removed");
      assert.equal(settings.includes("writeProtection"), false, "writeProtection should be removed");
    });

    it("unlockPptxRestrictions removes modifyVerifier/writeProtection", async () => {
      const work = path.join(TMP_ROOT, "pptx-success");
      await fs.ensureDir(work);
      let srcPptx;
      if (await fs.pathExists(DOCS_PPTX_SIMPLE)) {
        srcPptx = path.join(work, "in.pptx");
        const buf = await fs.readFile(DOCS_PPTX_SIMPLE);
        const zip = await JSZip.loadAsync(buf);
        // inject protection into a slide
        const slideFiles = zip.file(/^ppt\/slides\/slide\d+\.xml$/);
        if (slideFiles.length > 0) {
          const slide = slideFiles[0];
          let xml = await slide.async("string");
          xml = xml.replace("</p:sld>", `<p:modifyVerifier xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/><p:writeProtection/></p:sld>`);
          zip.file(slide.name, xml);
        } else {
          zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:modifyVerifier/></p:presentation>`);
        }
        const outBuf = await zip.generateAsync({ type: "nodebuffer" });
        await fs.writeFile(srcPptx, outBuf);
      } else {
        srcPptx = path.join(work, "in.pptx");
        const zip = new JSZip();
        zip.file("[Content_Types].xml", `<Types/>`);
        zip.file("_rels/.rels", `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/package/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
        zip.file("ppt/presentation.xml", `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:modifyVerifier/><p:writeProtection/></p:presentation>`);
        zip.file("ppt/_rels/presentation.xml.rels", `<Relationships/>`);
        zip.file("ppt/slides/slide1.xml", `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:modifyVerifier/><p:cSld><p:spTree/></p:cSld></p:sld>`);
        const buf = await zip.generateAsync({ type: "nodebuffer" });
        await fs.writeFile(srcPptx, buf);
      }
      const out = path.join(work, "out.pptx");
      await assert.doesNotReject(() => unlockPptxRestrictions({ inputPath: srcPptx, outputPath: out }));
      assert.ok(await fs.pathExists(out));
      const outBuf = await fs.readFile(out);
      const zipOut = await JSZip.loadAsync(outBuf);
      for (const file of zipOut.file(/^ppt\/.*\.xml$/)) {
        const xml = await file.async("string");
        assert.equal(xml.includes("modifyVerifier"), false);
        assert.equal(xml.includes("writeProtection"), false);
      }
    });

    it("normalizeOfficeDocument succeeds on valid docx", async () => {
      const work = path.join(TMP_ROOT, "norm-docx");
      await fs.ensureDir(work);
      const src = await createProtectedDocx(work, "norm.docx");
      const out = path.join(work, "out.docx");
      await assert.doesNotReject(() => normalizeOfficeDocument({ inputPath: src, outputPath: out, extension: ".docx" }));
      assert.ok(await fs.pathExists(out));
    });
  });

  describe("validation: missing Office entries -> FILE_CORRUPTED", () => {
    it("throws FILE_CORRUPTED when required entries missing", async () => {
      const work = path.join(TMP_ROOT, "missing-entries");
      await fs.ensureDir(work);
      const zip = new JSZip();
      zip.file("[Content_Types].xml", `<Types/>`);
      // missing _rels/.rels and word/document.xml
      const buf = await zip.generateAsync({ type: "nodebuffer" });
      const p = path.join(work, "bad.docx");
      await fs.writeFile(p, buf);
      const out = path.join(work, "out.docx");
      await assert.rejects(
        () => unlockDocxRestrictions({ inputPath: p, outputPath: out }),
        (err) => err.code === "FILE_CORRUPTED"
      );
    });
  });

  describe("edge: non-OLE small file should be FILE_CORRUPTED not PASSWORD_REQUIRED", () => {
    it("random bytes not OLE should be FILE_CORRUPTED", async () => {
      const work = path.join(TMP_ROOT, "edge-random");
      await fs.ensureDir(work);
      const p = path.join(work, "rand.docx");
      await fs.writeFile(p, Buffer.from("hello world random bytes not zip"));
      const out = path.join(work, "out.docx");
      await assert.rejects(() => unlockDocxRestrictions({ inputPath: p, outputPath: out }), (err) => err.code === "FILE_CORRUPTED" || err.code === "PASSWORD_REQUIRED");
      // Should be FILE_CORRUPTED because not password
      try {
        await unlockDocxRestrictions({ inputPath: p, outputPath: out });
      } catch (e) {
        assert.equal(e.code, "FILE_CORRUPTED");
      }
    });
  });
});
