// Frozen core contract regression file for the seven shipped tools.
//
// Authority: AGENTS.md, section "FROZEN CORE CONTRACT" (required reading), plus
// Temp/STORIES.md wave 1, story "Nothing that already works stops working" (Critical).
// Every case below drives processFile in utils/processors/router.js only, and asserts the
// contract text: accepted input, status code, response field names, output filename
// pattern, password behaviour and the frozen qpdf arguments for compress.
//
// The two contract points that used to be reported as unpinned are now pinned, each where it
// is actually observable:
//   1. rotate angle default 90. processFile rejects a missing rotationAngle with
//      UNSUPPORTED_FILE, so the 90 default is applied by the route layer. It is pinned through
//      the real POST /process route in the "HTTP boundary" describe, together with pages
//      defaulting to all pages.
//   2. OLE-header xlsx. docx and pptx answer PASSWORD_REQUIRED; xlsx answers FILE_CORRUPTED 400
//      today. The xlsx mapping is pinned as the observed contract, not as the ideal, so a change
//      is visible. The owner still has to decide the intended mapping.
//
// The HTTP response envelope (results[], downloadId, downloadName, downloadUrl, batchDownloadId,
// batchDownloadName, batchDownloadUrl) is built by the route layer, not by processFile, and no
// test under tests/server/ pinned it, so the same "HTTP boundary" describe pins it here.
//
// Fixtures are generated per test with pdf-lib, JSZip, ExcelJS and sharp, then written
// under a unique per-test temp directory. Merge consumes (moves) its input files, so no
// fixture is shared between tests.

import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import yauzl from "yauzl";
import { execFileSync, spawnSync } from "node:child_process";
import express from "express";
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { processFile } from "../../utils/processors/router.js";
import { AppError } from "../../utils/errors.js";
import filesRouter from "../../server/src/routes/files.js";
import { errorHandler } from "../../server/src/middleware/errorHandler.js";
import { ensureRuntimeDirectories } from "../../server/src/config.js";
import {
  SECURE_ENCRYPTION_MESSAGE,
  CONVERSION_TARGETS,
  MIME_BY_EXTENSION,
  OPERATION_MODES,
} from "../../utils/constants.js";

const TMP_ROOT = path.join(os.tmpdir(), `drdocs-frozen-contract-${Date.now()}`);
const QPDF_BIN = process.env.QPDF_BIN || "qpdf";
const LIBRE_BIN = process.env.LIBREOFFICE_BIN || "soffice";
const DOCX_MIME = MIME_BY_EXTENSION[".docx"][0];
const PPTX_MIME = MIME_BY_EXTENSION[".pptx"][0];
const XLSX_MIME = MIME_BY_EXTENSION[".xlsx"][0];
const MARKER = "FROZEN-LOSSLESS-MARKER";
// The seven operations named by the contract. OPERATION_MODES is a set of live values.
const FROZEN_OPERATIONS = ["unlock", "convert", "merge", "split", "ocr", "rotate", "compress"];
const OUTPUT_FIELDS = [
  "outputPath",
  "outputExtension",
  "sourceName",
  "outputName",
  "detectedType",
  "message",
  "mimeType",
];

// A missing soffice must never be scored as a pass. Without the binary the LibreOffice paths
// reject with PROCESSING_FAILED, which is exactly what the tolerant branches below accept, so
// those cases would go green for the wrong reason. soffice is probed once with "--version" and
// the affected cases are skipped with an explicit reason when the probe does not exit 0. This is
// the same convention as the soffice probe in tests/utils/processors/concurrentConversion.test.js.
function probeBinary(bin) {
  const probe = spawnSync(bin, ["--version"], {
    encoding: "utf8",
    timeout: 60000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (probe.error) return false;
  return probe.status === 0;
}

const SOFFICE_UNAVAILABLE = probeBinary(LIBRE_BIN)
  ? false
  : `${LIBRE_BIN} --version did not exit 0, so no LibreOffice export can run here`;

let workSeq = 0;
async function newWork(label) {
  const dir = path.join(TMP_ROOT, `${label}-${workSeq++}`);
  await fs.ensureDir(dir);
  return dir;
}

function mkInput(filePath, originalName, mimeType) {
  return { path: filePath, originalName, mimeType };
}

function normExt(ext) {
  return String(ext).replace(/^\./, "").toLowerCase();
}

function outputFileName(out) {
  return out.outputName || path.basename(out.outputPath);
}

function runProcess(options, workDir) {
  return processFile({
    qpdfBin: QPDF_BIN,
    libreOfficeBin: LIBRE_BIN,
    workDir,
    outputBasePath: path.join(workDir, "out"),
    ...options,
  });
}

async function readContentText(pdfBytes) {
  const doc = await PDFDocument.load(pdfBytes);
  const contents = doc.getPages()[0].node.Contents();
  const elems = contents && contents.asArray ? contents.asArray() : [contents];
  let text = "";
  for (const el of elems) {
    const looked = doc.context.lookup(el);
    if (looked instanceof PDFRawStream) {
      text += Buffer.from(decodePDFRawStream(looked).decode()).toString("latin1");
    }
  }
  return text;
}

async function readImageStreams(pdfBytes) {
  const doc = await PDFDocument.load(pdfBytes);
  const resources = doc.getPages()[0].node.Resources();
  const xobjects = doc.context.lookup(resources.get(PDFName.of("XObject")));
  const streams = [];
  for (const key of xobjects.keys()) {
    const stream = doc.context.lookup(xobjects.get(key));
    if (stream instanceof PDFRawStream) {
      streams.push(Buffer.from(decodePDFRawStream(stream).decode()));
    }
  }
  return streams;
}

async function assertResultShape(result) {
  assert.ok(result && typeof result === "object", "result must be an object");
  assert.equal(typeof result.message, "string", "result.message must be a string");
  assert.ok(Array.isArray(result.outputs) && result.outputs.length > 0, "result.outputs must be non-empty");
  for (const out of result.outputs) {
    for (const field of OUTPUT_FIELDS) {
      assert.ok(field in out, `output is missing the frozen field ${field}`);
    }
    assert.equal(typeof out.outputPath, "string");
    assert.ok(await fs.pathExists(out.outputPath), `output file does not exist: ${out.outputPath}`);
    assert.ok((await fs.stat(out.outputPath)).size > 0, `output file is empty: ${out.outputPath}`);
    assert.match(String(out.outputExtension), /^\.[a-z0-9]+$/i, "outputExtension must be a dot extension");
    assert.equal(typeof out.sourceName, "string");
    assert.ok(out.sourceName.length > 0, "sourceName must not be empty");
    assert.equal(typeof out.message, "string");
    assert.equal(typeof out.detectedType, "string");
    assert.ok(out.detectedType.length > 0, "detectedType must not be empty");
    assert.match(String(out.mimeType), /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i, "mimeType must be a real MIME type");
  }
}

async function assertRejected(promise, code) {
  const outcome = await promise.then(
    (result) => result,
    (err) => err
  );
  if (!(outcome instanceof Error)) {
    assert.fail(`expected ${code} rejection, got a success result with ${outcome?.outputs?.length} output(s)`);
  }
  assert.ok(outcome instanceof AppError, `expected an AppError, got ${outcome.constructor.name}`);
  assert.equal(outcome.code, code);
  assert.equal(outcome.statusCode, 400, "every rejected input maps to status 400");
  return outcome;
}

async function assertPasswordRequired(promise) {
  const err = await assertRejected(promise, "PASSWORD_REQUIRED");
  assert.equal(err.message, SECURE_ENCRYPTION_MESSAGE, "PASSWORD_REQUIRED must carry SECURE_ENCRYPTION_MESSAGE");
  return err;
}

async function makePdf(dir, name, pages = 1, options = {}) {
  const { marker = null, image = null, useObjectStreams = false } = options;
  const doc = await PDFDocument.create();
  const font = marker ? await doc.embedFont("Helvetica") : null;
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([300, 400]);
    if (marker && i === 0) page.drawText(marker, { x: 20, y: 200, size: 12, font });
    if (image && i === 0) {
      const embedded = await doc.embedPng(image);
      page.drawImage(embedded, { x: 10, y: 10, width: 32, height: 24 });
    }
  }
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, await doc.save({ useObjectStreams }));
  return filePath;
}

async function makeDocx(dir, name, text) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`
  );
  zip.file(
    "word/settings.xml",
    `<?xml version="1.0"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:documentProtection w:edit="readOnly" w:enforcement="1"/><w:writeProtection/></w:settings>`
  );
  zip.file(
    "docProps/core.xml",
    `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"></cp:coreProperties>`
  );
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, await zip.generateAsync({ type: "nodebuffer" }));
  return filePath;
}

async function makePptx(dir, name, text) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`
  );
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:modifyVerifier/></p:presentation>`
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`
  );
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:writeProtection/></p:sld>`
  );
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, await zip.generateAsync({ type: "nodebuffer" }));
  return filePath;
}

async function makeXlsx(dir, name, text, protect = false) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow([text]);
  if (protect) await ws.protect("frozen-contract");
  const filePath = path.join(dir, name);
  await wb.xlsx.writeFile(filePath);
  return filePath;
}

async function makeZip(dir, name) {
  const zip = new JSZip();
  zip.file("hello.txt", "hello world");
  zip.file("folder/nested.txt", "nested");
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, await zip.generateAsync({ type: "nodebuffer" }));
  return filePath;
}

async function makeImage(dir, name, format) {
  const sharp = (await import("sharp")).default;
  const buf = await sharp({
    create: { width: 24, height: 18, channels: 3, background: { r: 10, g: 120, b: 200 } },
  })
    [format]()
    .toBuffer();
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, buf);
  return filePath;
}

function makeOleFile(dir, name) {
  const oleSignature = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);
  const filePath = path.join(dir, name);
  return fs.writeFile(filePath, Buffer.concat([oleSignature, Buffer.from("fake ole container")])).then(() => filePath);
}

async function makeEncryptedPdf(dir, name) {
  const source = await makePdf(dir, `${path.parse(name).name}-source.pdf`, 2);
  const target = path.join(dir, name);
  execFileSync(QPDF_BIN, ["--encrypt", "user-secret", "owner-secret", "256", "--", source, target]);
  const bytes = await fs.readFile(target);
  assert.ok(bytes.length > 0, "encrypted fixture must be written by qpdf");
  assert.equal(bytes.toString("latin1", 0, 5), "%PDF-", "encrypted fixture must be a PDF");
  return target;
}

describe("frozen core contract", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });
  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  describe("result shape", () => {
    it("unlock returns message plus outputs carrying the seven frozen fields", async () => {
      const work = await newWork("shape-unlock");
      const pdf = await makePdf(work, "shape.pdf", 2);
      const result = await runProcess(
        { operation: "unlock", inputFiles: [mkInput(pdf, "shape.pdf", "application/pdf")] },
        work
      );
      await assertResultShape(result);
      assert.equal(result.outputs.length, 1);
      assert.equal(result.outputs[0].outputExtension, ".pdf");
    });

    it("split returns message plus one output per part", async () => {
      const work = await newWork("shape-split");
      const pdf = await makePdf(work, "shape.pdf", 3);
      const result = await runProcess(
        { operation: "split", pageRanges: "1,2-3", inputFiles: [mkInput(pdf, "shape.pdf", "application/pdf")] },
        work
      );
      await assertResultShape(result);
      assert.equal(result.outputs.length, 2);
    });

    it("detectedType is the output extension uppercased and mimeType comes from MIME_BY_EXTENSION", async () => {
      const work = await newWork("shape-types");
      const pdf = await makePdf(work, "types.pdf", 1);
      const unlocked = await runProcess(
        { operation: "unlock", inputFiles: [mkInput(pdf, "types.pdf", "application/pdf")] },
        work
      );
      const pdfOut = unlocked.outputs[0];
      assert.equal(pdfOut.detectedType, "PDF");
      assert.equal(pdfOut.mimeType, MIME_BY_EXTENSION[".pdf"][0]);

      const docx = await makeDocx(work, "types.docx", "TYPES OCR TEXT");
      const ocr = await runProcess(
        { operation: "ocr", inputFiles: [mkInput(docx, "types.docx", DOCX_MIME)] },
        work
      );
      const txtOut = ocr.outputs[0];
      assert.equal(txtOut.detectedType, "TXT");
      assert.equal(txtOut.mimeType, "text/plain");
      assert.equal(txtOut.outputExtension, ".txt");
    });
  });

  describe("unlock keeps the input extension", () => {
    it("unlock pdf returns a pdf with the same page count", async () => {
      const work = await newWork("unlock-pdf");
      const pdf = await makePdf(work, "plain.pdf", 3);
      const result = await runProcess(
        { operation: "unlock", inputFiles: [mkInput(pdf, "plain.pdf", "application/pdf")] },
        work
      );
      await assertResultShape(result);
      assert.equal(result.outputs.length, 1);
      assert.equal(normExt(result.outputs[0].outputExtension), "pdf");
      const doc = await PDFDocument.load(await fs.readFile(result.outputs[0].outputPath));
      assert.equal(doc.getPageCount(), 3);
    });

    it("unlock docx returns a docx that still contains word/document.xml", async () => {
      const work = await newWork("unlock-docx");
      const docx = await makeDocx(work, "plain.docx", "UNLOCK DOCX TEXT");
      const result = await runProcess(
        { operation: "unlock", inputFiles: [mkInput(docx, "plain.docx", DOCX_MIME)] },
        work
      );
      await assertResultShape(result);
      assert.equal(normExt(result.outputs[0].outputExtension), "docx");
      const zip = await JSZip.loadAsync(await fs.readFile(result.outputs[0].outputPath));
      assert.ok(zip.file("word/document.xml"), "output must still contain word/document.xml");
      const settings = (await zip.file("word/settings.xml").async("string")) || "";
      assert.equal(settings.includes("documentProtection"), false);
      assert.equal(settings.includes("writeProtection"), false);
    });

    it("unlock pptx returns a pptx without p:modifyVerifier or p:writeProtection", async () => {
      const work = await newWork("unlock-pptx");
      const pptx = await makePptx(work, "plain.pptx", "UNLOCK PPTX TEXT");
      const result = await runProcess(
        { operation: "unlock", inputFiles: [mkInput(pptx, "plain.pptx", PPTX_MIME)] },
        work
      );
      await assertResultShape(result);
      assert.equal(normExt(result.outputs[0].outputExtension), "pptx");
      const zip = await JSZip.loadAsync(await fs.readFile(result.outputs[0].outputPath));
      for (const name of Object.keys(zip.files)) {
        if (!/^ppt\/.*\.xml$/.test(name)) continue;
        const xml = await zip.file(name).async("string");
        assert.equal(xml.includes("modifyVerifier"), false, `${name} still contains modifyVerifier`);
        assert.equal(xml.includes("writeProtection"), false, `${name} still contains writeProtection`);
      }
    });

    it("unlock xlsx returns an xlsx readable by ExcelJS", async () => {
      const work = await newWork("unlock-xlsx");
      const xlsx = await makeXlsx(work, "plain.xlsx", "UNLOCK XLSX TEXT", true);
      const result = await runProcess(
        { operation: "unlock", inputFiles: [mkInput(xlsx, "plain.xlsx", XLSX_MIME)] },
        work
      );
      await assertResultShape(result);
      assert.equal(normExt(result.outputs[0].outputExtension), "xlsx");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(result.outputs[0].outputPath);
      assert.ok(wb.worksheets.length > 0);
    });

    it("unlock zip returns a zip with the same entries", async () => {
      const work = await newWork("unlock-zip");
      const zipFile = await makeZip(work, "plain.zip");
      const result = await runProcess(
        { operation: "unlock", inputFiles: [mkInput(zipFile, "plain.zip", MIME_BY_EXTENSION[".zip"][0])] },
        work
      );
      await assertResultShape(result);
      assert.equal(normExt(result.outputs[0].outputExtension), "zip");
      const source = await JSZip.loadAsync(await fs.readFile(zipFile));
      const output = await JSZip.loadAsync(await fs.readFile(result.outputs[0].outputPath));
      assert.deepEqual(Object.keys(output.files).sort(), Object.keys(source.files).sort());
    });

    it("unlock rejects an unsupported extension with UNSUPPORTED_FILE 400", async () => {
      const work = await newWork("unlock-txt");
      const txt = path.join(work, "note.txt");
      await fs.writeFile(txt, "hello");
      await assertRejected(
        runProcess({ operation: "unlock", inputFiles: [mkInput(txt, "note.txt", "text/plain")] }, work),
        "UNSUPPORTED_FILE"
      );
    });
  });

  describe("convert follows CONVERSION_TARGETS", () => {
    async function sourceFixture(work, ext) {
      switch (ext) {
        case ".pdf":
          return makePdf(work, "src.pdf", 1);
        case ".docx":
          return makeDocx(work, "src.docx", "CONVERT DOCX TEXT");
        case ".pptx":
          return makePptx(work, "src.pptx", "CONVERT PPTX TEXT");
        case ".xlsx":
          return makeXlsx(work, "src.xlsx", "CONVERT XLSX TEXT");
        case ".jpg":
        case ".jpeg":
          return makeImage(work, `src${ext}`, "jpeg");
        case ".png":
          return makeImage(work, "src.png", "png");
        default:
          throw new Error(`no fixture builder for ${ext}`);
      }
    }

    // Declared pairs that this machine's LibreOffice and sharp build can actually produce.
    // Declared pairs that cannot be produced here (pdf to txt, xlsx to txt, pptx to txt,
    // merge to docx) are reported, not pinned: the accepted-pair check is the table, and
    // they are never rejected as UNSUPPORTED_FILE, which the negative matrix covers.
    const workingPairs = [
      [".png", "pdf"],
      [".png", "jpg"],
      [".png", "webp"],
      [".png", "avif"],
      [".png", "tiff"],
      [".jpg", "pdf"],
      [".jpg", "png"],
      [".docx", "pdf"],
      [".docx", "txt"],
      [".xlsx", "csv"],
    ];

    for (const [sourceExt, target] of workingPairs) {
      it(`convert ${sourceExt} to ${target} is a declared pair and produces .${target}`, async () => {
        assert.ok(
          CONVERSION_TARGETS[sourceExt].includes(target),
          `${sourceExt} to ${target} must be declared in CONVERSION_TARGETS`
        );
        const work = await newWork(`convert-${normExt(sourceExt)}-${target}`);
        const source = await sourceFixture(work, sourceExt);
        const result = await runProcess(
          {
            operation: "convert",
            targetFormat: target,
            inputFiles: [mkInput(source, path.basename(source), MIME_BY_EXTENSION[sourceExt][0])],
          },
          work
        );
        await assertResultShape(result);
        assert.equal(result.outputs.length, 1);
        assert.equal(normExt(result.outputs[0].outputExtension), target);
      });
    }

    // Declared pairs this LibreOffice build cannot export, left untested before. The contract
    // promise for a declared pair is that the input is accepted, never UNSUPPORTED_FILE; it does
    // not promise the conversion succeeds. Measured on this machine, all three fail with
    // PROCESSING_FAILED 500 and "no export filter": a PDF imports as a Draw document, and this
    // build's Draw, Impress and Calc export no plain-text target. Each case asserts the pair is
    // declared, that processFile does not reject it as UNSUPPORTED_FILE, and that any success is a
    // real non-empty .txt. Skipped when soffice is absent so a missing binary is never a pass.
    const declaredTextPairs = [
      [".pdf", "txt"],
      [".pptx", "txt"],
      [".xlsx", "txt"],
    ];

    for (const [sourceExt, target] of declaredTextPairs) {
      it(`convert ${sourceExt} to ${target} is a declared pair and is accepted, never UNSUPPORTED_FILE`, { skip: SOFFICE_UNAVAILABLE }, async () => {
        assert.ok(
          CONVERSION_TARGETS[sourceExt].includes(target),
          `${sourceExt} to ${target} must be declared in CONVERSION_TARGETS`
        );
        const work = await newWork(`convert-declared-${normExt(sourceExt)}-${target}`);
        const source = await sourceFixture(work, sourceExt);
        const outcome = await runProcess(
          {
            operation: "convert",
            targetFormat: target,
            inputFiles: [mkInput(source, path.basename(source), MIME_BY_EXTENSION[sourceExt][0])],
          },
          work
        ).then(
          (result) => result,
          (err) => err
        );
        if (outcome instanceof Error) {
          assert.ok(outcome instanceof AppError, `expected an AppError, got ${outcome.constructor.name}`);
          assert.equal(
            outcome.code,
            "PROCESSING_FAILED",
            `${sourceExt} to ${target} is a declared pair, so a failure must be PROCESSING_FAILED, got ${outcome.code}`
          );
          assert.equal(outcome.statusCode, 500, "a declared pair that cannot be exported must fail as a 500");
          return;
        }
        await assertResultShape(outcome);
        assert.equal(outcome.outputs.length, 1);
        assert.equal(normExt(outcome.outputs[0].outputExtension), target);
        const text = await fs.readFile(outcome.outputs[0].outputPath, "utf8");
        assert.ok(text.length > 0, "a successful conversion to txt must write text");
      });
    }

    it("convert rejects a missing targetFormat with UNSUPPORTED_FILE 400", async () => {
      const work = await newWork("convert-no-target");
      const pdf = await makePdf(work, "src.pdf", 1);
      await assertRejected(
        runProcess(
          { operation: "convert", targetFormat: "", inputFiles: [mkInput(pdf, "src.pdf", "application/pdf")] },
          work
        ),
        "UNSUPPORTED_FILE"
      );
    });

    it("convert rejects every target that is not in CONVERSION_TARGETS", async () => {
      const work = await newWork("convert-complement");
      const candidates = new Set(["pdf", "png", "jpg", "jpeg", "zip", "doc", "csv", "json", "odt", "rtf", "html", "txt", "pptx", "docx", "xlsx", "odp", "ppt", "ods", "xls", "epub", "webp", "avif", "tiff"]);
      let rejected = 0;
      for (const sourceExt of Object.keys(CONVERSION_TARGETS)) {
        const source = await sourceFixture(work, sourceExt);
        for (const candidate of candidates) {
          if (CONVERSION_TARGETS[sourceExt].includes(candidate)) continue;
          await assertRejected(
            runProcess(
              {
                operation: "convert",
                targetFormat: candidate,
                inputFiles: [mkInput(source, path.basename(source), MIME_BY_EXTENSION[sourceExt][0])],
              },
              work
            ),
            "UNSUPPORTED_FILE"
          );
          rejected += 1;
        }
      }
      assert.ok(rejected > 50, `the complement matrix must exercise the whole table, ran ${rejected} rejections`);
    });

    it("convert rejects a source extension with no entry in CONVERSION_TARGETS", async () => {
      const work = await newWork("convert-zip-source");
      const zipFile = await makeZip(work, "src.zip");
      assert.equal(CONVERSION_TARGETS[".zip"], undefined);
      await assertRejected(
        runProcess(
          {
            operation: "convert",
            targetFormat: "pdf",
            inputFiles: [mkInput(zipFile, "src.zip", MIME_BY_EXTENSION[".zip"][0])],
          },
          work
        ),
        "UNSUPPORTED_FILE"
      );
    });
  });

  describe("merge", () => {
    it("merge of two PDFs produces merged_files_processed.pdf with the summed page count", async () => {
      const work = await newWork("merge-two");
      const first = await makePdf(work, "one.pdf", 1);
      const second = await makePdf(work, "two.pdf", 2);
      const result = await runProcess(
        {
          operation: "merge",
          inputFiles: [
            mkInput(first, "one.pdf", "application/pdf"),
            mkInput(second, "two.pdf", "application/pdf"),
          ],
        },
        work
      );
      await assertResultShape(result);
      assert.equal(result.outputs.length, 1);
      assert.equal(outputFileName(result.outputs[0]), "merged_files_processed.pdf");
      assert.equal(normExt(result.outputs[0].outputExtension), "pdf");
      const doc = await PDFDocument.load(await fs.readFile(result.outputs[0].outputPath));
      assert.equal(doc.getPageCount(), 3);
    });

    it("merge of three PDFs keeps every page", async () => {
      const work = await newWork("merge-three");
      const files = [
        await makePdf(work, "a.pdf", 1),
        await makePdf(work, "b.pdf", 2),
        await makePdf(work, "c.pdf", 1),
      ];
      const result = await runProcess(
        {
          operation: "merge",
          inputFiles: files.map((f) => mkInput(f, path.basename(f), "application/pdf")),
        },
        work
      );
      await assertResultShape(result);
      const doc = await PDFDocument.load(await fs.readFile(result.outputs[0].outputPath));
      assert.equal(doc.getPageCount(), 4);
    });

    it("merge accepts an image beside a PDF and merges it as a page", async () => {
      const work = await newWork("merge-image");
      const pdf = await makePdf(work, "base.pdf", 1);
      const png = await makeImage(work, "shot.png", "png");
      const result = await runProcess(
        {
          operation: "merge",
          inputFiles: [mkInput(pdf, "base.pdf", "application/pdf"), mkInput(png, "shot.png", "image/png")],
        },
        work
      );
      await assertResultShape(result);
      const doc = await PDFDocument.load(await fs.readFile(result.outputs[0].outputPath));
      assert.equal(doc.getPageCount(), 2);
    });

    it("merge rejects a single file with UNSUPPORTED_FILE 400", async () => {
      const work = await newWork("merge-one");
      const pdf = await makePdf(work, "solo.pdf", 1);
      await assertRejected(
        runProcess({ operation: "merge", inputFiles: [mkInput(pdf, "solo.pdf", "application/pdf")] }, work),
        "UNSUPPORTED_FILE"
      );
    });

    it("merge rejects an empty input list with UNSUPPORTED_FILE 400", async () => {
      const work = await newWork("merge-empty");
      await assertRejected(runProcess({ operation: "merge", inputFiles: [] }, work), "UNSUPPORTED_FILE");
    });

    it("merge rejects a zip input with UNSUPPORTED_FILE 400", async () => {
      const work = await newWork("merge-zip");
      const pdf = await makePdf(work, "base.pdf", 1);
      const zipFile = await makeZip(work, "extra.zip");
      await assertRejected(
        runProcess(
          {
            operation: "merge",
            inputFiles: [
              mkInput(pdf, "base.pdf", "application/pdf"),
              mkInput(zipFile, "extra.zip", MIME_BY_EXTENSION[".zip"][0]),
            ],
          },
          work
        ),
        "UNSUPPORTED_FILE"
      );
    });

    it("merge rejects a target format that is not PDF or DOCX with UNSUPPORTED_FILE 400", async () => {
      const work = await newWork("merge-bad-target");
      const first = await makePdf(work, "a.pdf", 1);
      const second = await makePdf(work, "b.pdf", 1);
      for (const target of ["txt", "zip", "jpg"]) {
        await assertRejected(
          runProcess(
            {
              operation: "merge",
              targetFormat: target,
              inputFiles: [mkInput(first, "a.pdf", "application/pdf"), mkInput(second, "b.pdf", "application/pdf")],
            },
            work
          ),
          "UNSUPPORTED_FILE"
        );
      }
    });

    it("merge accepts targetFormat docx: never UNSUPPORTED_FILE, and a success is a readable docx", { skip: SOFFICE_UNAVAILABLE }, async () => {
      // merge to docx runs the merged PDF through soffice. On this LibreOffice build that export
      // is not available, so the observed result is PROCESSING_FAILED 500 with "no export filter":
      // a PDF imports as a Draw document and Draw exports no DOCX. The success branch is asserted
      // in full for a build that can export DOCX, and the failure branch is pinned to
      // PROCESSING_FAILED 500 and never UNSUPPORTED_FILE, so a regression that rejects the target
      // or crashes is caught. Skipped when soffice is absent, because without it PROCESSING_FAILED
      // would be a pass for the wrong reason.
      const work = await newWork("merge-docx");
      const first = await makePdf(work, "a.pdf", 1);
      const second = await makePdf(work, "b.pdf", 1);
      const outcome = await runProcess(
        {
          operation: "merge",
          targetFormat: "docx",
          inputFiles: [mkInput(first, "a.pdf", "application/pdf"), mkInput(second, "b.pdf", "application/pdf")],
        },
        work
      ).then(
        (result) => result,
        (err) => err
      );
      if (outcome instanceof Error) {
        // DOCX is an accepted target, so it must never be rejected as unsupported.
        assert.ok(outcome instanceof AppError, `expected an AppError, got ${outcome.constructor.name}`);
        assert.equal(outcome.code, "PROCESSING_FAILED", `docx target failed with ${outcome.code}`);
        assert.equal(outcome.statusCode, 500, "a docx export failure must be a 500");
        return;
      }
      await assertResultShape(outcome);
      assert.equal(outcome.outputs.length, 1);
      assert.equal(normExt(outcome.outputs[0].outputExtension), "docx");
      const zip = await JSZip.loadAsync(await fs.readFile(outcome.outputs[0].outputPath));
      assert.ok(zip.file("word/document.xml"), "a successful merge to docx must contain word/document.xml");
    });
  });

  describe("split", () => {
    it("split names single-page parts <base>_part_<n>_page_<x>.pdf and range parts <base>_part_<n>_pages_<a>-<b>.pdf", async () => {
      const work = await newWork("split-names");
      const pdf = await makePdf(work, "split.pdf", 5);
      const result = await runProcess(
        { operation: "split", pageRanges: "1,2-3", inputFiles: [mkInput(pdf, "split.pdf", "application/pdf")] },
        work
      );
      await assertResultShape(result);
      assert.equal(result.outputs.length, 2);
      const names = result.outputs.map((out) => outputFileName(out));
      assert.deepEqual(names, ["split_part_1_page_1.pdf", "split_part_2_pages_2-3.pdf"]);
      const pageCounts = [];
      for (const out of result.outputs) {
        const doc = await PDFDocument.load(await fs.readFile(out.outputPath));
        pageCounts.push(doc.getPageCount());
      }
      assert.deepEqual(pageCounts, [1, 2]);
    });

    it("split accepts ranges 1-3,5,7-10 and preserves part order", async () => {
      const work = await newWork("split-wide-ranges");
      const pdf = await makePdf(work, "splitrange.pdf", 10);
      const result = await runProcess(
        {
          operation: "split",
          pageRanges: "1-3,5,7-10",
          inputFiles: [mkInput(pdf, "splitrange.pdf", "application/pdf")],
        },
        work
      );
      await assertResultShape(result);
      assert.equal(result.outputs.length, 3);
      assert.deepEqual(result.outputs.map((out) => outputFileName(out)), [
        "splitrange_part_1_pages_1-3.pdf",
        "splitrange_part_2_page_5.pdf",
        "splitrange_part_3_pages_7-10.pdf",
      ]);
    });

    it("split with no pageRanges emits one part per page named <base>_part_<n>_page_<x>.pdf", async () => {
      const work = await newWork("split-all-pages");
      const pdf = await makePdf(work, "splitall.pdf", 3);
      const result = await runProcess(
        { operation: "split", pageRanges: "", inputFiles: [mkInput(pdf, "splitall.pdf", "application/pdf")] },
        work
      );
      await assertResultShape(result);
      assert.equal(result.outputs.length, 3);
      assert.deepEqual(result.outputs.map((out) => outputFileName(out)), [
        "splitall_part_1_page_1.pdf",
        "splitall_part_2_page_2.pdf",
        "splitall_part_3_page_3.pdf",
      ]);
    });

    it("split rejects more than one file with UNSUPPORTED_FILE 400", async () => {
      const work = await newWork("split-many");
      const first = await makePdf(work, "a.pdf", 1);
      const second = await makePdf(work, "b.pdf", 1);
      await assertRejected(
        runProcess(
          {
            operation: "split",
            inputFiles: [mkInput(first, "a.pdf", "application/pdf"), mkInput(second, "b.pdf", "application/pdf")],
          },
          work
        ),
        "UNSUPPORTED_FILE"
      );
    });

    it("split rejects a non-PDF with UNSUPPORTED_FILE 400", async () => {
      const work = await newWork("split-png");
      const png = await makeImage(work, "shot.png", "png");
      await assertRejected(
        runProcess({ operation: "split", pageRanges: "1", inputFiles: [mkInput(png, "shot.png", "image/png")] }, work),
        "UNSUPPORTED_FILE"
      );
    });
  });

  describe("rotate", () => {
    it("rotate with pages omitted rotates every page", async () => {
      const work = await newWork("rotate-all-pages");
      const pdf = await makePdf(work, "rotate.pdf", 3);
      const result = await runProcess(
        { operation: "rotate", rotationAngle: "90", inputFiles: [mkInput(pdf, "rotate.pdf", "application/pdf")] },
        work
      );
      await assertResultShape(result);
      assert.equal(normExt(result.outputs[0].outputExtension), "pdf");
      const doc = await PDFDocument.load(await fs.readFile(result.outputs[0].outputPath));
      assert.deepEqual(
        doc.getPages().map((page) => ((page.getRotation().angle % 360) + 360) % 360),
        [90, 90, 90]
      );
    });

    it("rotate accepts pages 1,3-5,8 and rotates only those pages", async () => {
      const work = await newWork("rotate-selected-pages");
      const pdf = await makePdf(work, "rotate.pdf", 8);
      const result = await runProcess(
        {
          operation: "rotate",
          rotationAngle: "180",
          pages: "1,3-5,8",
          inputFiles: [mkInput(pdf, "rotate.pdf", "application/pdf")],
        },
        work
      );
      await assertResultShape(result);
      const doc = await PDFDocument.load(await fs.readFile(result.outputs[0].outputPath));
      assert.deepEqual(
        doc.getPages().map((page) => ((page.getRotation().angle % 360) + 360) % 360),
        [180, 0, 180, 180, 180, 0, 0, 180]
      );
    });

    it("rotate accepts 270 and applies it to every page", async () => {
      const work = await newWork("rotate-270");
      const pdf = await makePdf(work, "rotate.pdf", 2);
      const result = await runProcess(
        { operation: "rotate", rotationAngle: "270", inputFiles: [mkInput(pdf, "rotate.pdf", "application/pdf")] },
        work
      );
      await assertResultShape(result);
      const doc = await PDFDocument.load(await fs.readFile(result.outputs[0].outputPath));
      assert.deepEqual(
        doc.getPages().map((page) => ((page.getRotation().angle % 360) + 360) % 360),
        [270, 270]
      );
    });

    it("rotate rejects an angle outside 90, 180 and 270 with UNSUPPORTED_FILE 400", async () => {
      const work = await newWork("rotate-bad-angle");
      const pdf = await makePdf(work, "rotate.pdf", 1);
      await assertRejected(
        runProcess(
          { operation: "rotate", rotationAngle: "45", inputFiles: [mkInput(pdf, "rotate.pdf", "application/pdf")] },
          work
        ),
        "UNSUPPORTED_FILE"
      );
    });

    it("rotate rejects a non-PDF with UNSUPPORTED_FILE 400", async () => {
      const work = await newWork("rotate-png");
      const png = await makeImage(work, "shot.png", "png");
      await assertRejected(
        runProcess(
          { operation: "rotate", rotationAngle: "90", inputFiles: [mkInput(png, "shot.png", "image/png")] },
          work
        ),
        "UNSUPPORTED_FILE"
      );
    });

    it("rotate rejects more than one file with UNSUPPORTED_FILE 400", async () => {
      const work = await newWork("rotate-many");
      const first = await makePdf(work, "a.pdf", 1);
      const second = await makePdf(work, "b.pdf", 1);
      await assertRejected(
        runProcess(
          {
            operation: "rotate",
            rotationAngle: "90",
            inputFiles: [mkInput(first, "a.pdf", "application/pdf"), mkInput(second, "b.pdf", "application/pdf")],
          },
          work
        ),
        "UNSUPPORTED_FILE"
      );
    });

    it("rotations list rotates each page by its own delta and leaves the rest untouched", async () => {
      const work = await newWork("rotate-per-page");
      const pdf = await makePdf(work, "rotate.pdf", 4);
      const result = await runProcess(
        {
          operation: "rotate",
          rotations: "1:270,3:90,4:180",
          inputFiles: [mkInput(pdf, "rotate.pdf", "application/pdf")],
        },
        work
      );
      await assertResultShape(result);
      const doc = await PDFDocument.load(await fs.readFile(result.outputs[0].outputPath));
      assert.deepEqual(
        doc.getPages().map((page) => ((page.getRotation().angle % 360) + 360) % 360),
        [270, 0, 90, 180]
      );
    });

    it("per-page rotations win over rotationAngle and pages when both arrive", async () => {
      const work = await newWork("rotate-both-fields");
      const pdf = await makePdf(work, "rotate.pdf", 2);
      const result = await runProcess(
        {
          operation: "rotate",
          rotationAngle: "90",
          pages: "1",
          rotations: "2:180",
          inputFiles: [mkInput(pdf, "rotate.pdf", "application/pdf")],
        },
        work
      );
      await assertResultShape(result);
      const doc = await PDFDocument.load(await fs.readFile(result.outputs[0].outputPath));
      assert.deepEqual(
        doc.getPages().map((page) => ((page.getRotation().angle % 360) + 360) % 360),
        [0, 180]
      );
    });

    it("per-page rotations reject a page past the last page with UNSUPPORTED_FILE 400", async () => {
      const work = await newWork("rotate-per-page-past");
      const pdf = await makePdf(work, "rotate.pdf", 2);
      await assertRejected(
        runProcess(
          {
            operation: "rotate",
            rotations: "3:90",
            inputFiles: [mkInput(pdf, "rotate.pdf", "application/pdf")],
          },
          work
        ),
        "UNSUPPORTED_FILE"
      );
    });

    it("per-page rotations reject an angle outside 90, 180 and 270", async () => {
      const work = await newWork("rotate-per-page-angle");
      const pdf = await makePdf(work, "rotate.pdf", 2);
      await assertRejected(
        runProcess(
          {
            operation: "rotate",
            rotations: "1:45",
            inputFiles: [mkInput(pdf, "rotate.pdf", "application/pdf")],
          },
          work
        ),
        "UNSUPPORTED_FILE"
      );
    });

    it("per-page rotations reject a page listed twice", async () => {
      const work = await newWork("rotate-per-page-dup");
      const pdf = await makePdf(work, "rotate.pdf", 3);
      await assertRejected(
        runProcess(
          {
            operation: "rotate",
            rotations: "1:90,1:180",
            inputFiles: [mkInput(pdf, "rotate.pdf", "application/pdf")],
          },
          work
        ),
        "UNSUPPORTED_FILE"
      );
    });

    it("per-page rotations reject a malformed token", async () => {
      const work = await newWork("rotate-per-page-bad-token");
      const pdf = await makePdf(work, "rotate.pdf", 3);
      await assertRejected(
        runProcess(
          {
            operation: "rotate",
            rotations: "one:90",
            inputFiles: [mkInput(pdf, "rotate.pdf", "application/pdf")],
          },
          work
        ),
        "UNSUPPORTED_FILE"
      );
    });
  });

  describe("compress is lossless and PDF only", () => {
    it("compress produces a linearized PDF with object streams", async () => {
      const work = await newWork("compress-flags");
      const pdf = await makePdf(work, "source.pdf", 4);
      const before = (await fs.readFile(pdf)).toString("latin1");
      assert.equal(before.includes("/Linearized"), false, "fixture must not be linearized before compress");
      assert.equal(before.includes("/ObjStm"), false, "fixture must not have object streams before compress");
      const result = await runProcess(
        { operation: "compress", inputFiles: [mkInput(pdf, "source.pdf", "application/pdf")] },
        work
      );
      await assertResultShape(result);
      assert.equal(normExt(result.outputs[0].outputExtension), "pdf");
      const after = (await fs.readFile(result.outputs[0].outputPath)).toString("latin1");
      assert.ok(after.slice(0, 1024).includes("/Linearized"), "qpdf --linearize must mark the output linearized");
      assert.ok(after.includes("/ObjStm"), "qpdf --object-streams=generate must emit object streams");
    });

    it("compress keeps the page count and the embedded image pixels byte for byte", async () => {
      const work = await newWork("compress-lossless");
      const sharp = (await import("sharp")).default;
      const png = await sharp({
        create: { width: 32, height: 24, channels: 3, background: { r: 200, g: 30, b: 90 } },
      })
        .png()
        .toBuffer();
      const rawPixels = await sharp(png).raw().toBuffer();
      const pdf = await makePdf(work, "source.pdf", 2, { image: png });
      const result = await runProcess(
        { operation: "compress", inputFiles: [mkInput(pdf, "source.pdf", "application/pdf")] },
        work
      );
      await assertResultShape(result);
      const outBytes = await fs.readFile(result.outputs[0].outputPath);
      const doc = await PDFDocument.load(outBytes);
      assert.equal(doc.getPageCount(), 2);
      const streams = await readImageStreams(outBytes);
      assert.equal(streams.length, 1, "the compressed PDF must still embed exactly one image");
      assert.equal(
        Buffer.compare(streams[0], rawPixels),
        0,
        "lossless compress must not re-encode the embedded image pixels"
      );
    });

    it("compress keeps the page text content of the source PDF", async () => {
      const work = await newWork("compress-text");
      const pdf = await makePdf(work, "source.pdf", 2, { marker: MARKER });
      const result = await runProcess(
        { operation: "compress", inputFiles: [mkInput(pdf, "source.pdf", "application/pdf")] },
        work
      );
      await assertResultShape(result);
      const text = await readContentText(await fs.readFile(result.outputs[0].outputPath));
      const markerHex = Buffer.from(MARKER).toString("hex").toUpperCase();
      assert.ok(text.toUpperCase().includes(markerHex), "compressed content stream must still carry the source text");
    });

    it("compress of two PDFs returns one compressed output per input", async () => {
      const work = await newWork("compress-two");
      const first = await makePdf(work, "one.pdf", 2);
      const second = await makePdf(work, "two.pdf", 3);
      const result = await runProcess(
        {
          operation: "compress",
          inputFiles: [
            mkInput(first, "one.pdf", "application/pdf"),
            mkInput(second, "two.pdf", "application/pdf"),
          ],
        },
        work
      );
      await assertResultShape(result);
      assert.equal(result.outputs.length, 2);
      for (const out of result.outputs) {
        const doc = await PDFDocument.load(await fs.readFile(out.outputPath));
        assert.ok(doc.getPageCount() >= 1);
      }
    });

    it("compress rejects a non-PDF with UNSUPPORTED_FILE 400", async () => {
      const work = await newWork("compress-txt");
      const txt = path.join(work, "note.txt");
      await fs.writeFile(txt, "hello");
      await assertRejected(
        runProcess({ operation: "compress", inputFiles: [mkInput(txt, "note.txt", "text/plain")] }, work),
        "UNSUPPORTED_FILE"
      );
    });
  });

  describe("ocr writes .txt", () => {
    it("ocr on a docx writes a .txt containing the document text", async () => {
      const work = await newWork("ocr-docx");
      const docx = await makeDocx(work, "source.docx", "FROZEN DOCX TEXT");
      const result = await runProcess(
        { operation: "ocr", inputFiles: [mkInput(docx, "source.docx", DOCX_MIME)] },
        work
      );
      await assertResultShape(result);
      assert.equal(normExt(result.outputs[0].outputExtension), "txt");
      const text = await fs.readFile(result.outputs[0].outputPath, "utf8");
      assert.ok(text.includes("FROZEN DOCX TEXT"), "extracted text must contain the source text");
    });

    it("ocr on an xlsx writes a .txt containing the sheet text", async () => {
      const work = await newWork("ocr-xlsx");
      const xlsx = await makeXlsx(work, "source.xlsx", "FROZEN XLSX TEXT");
      const result = await runProcess(
        { operation: "ocr", inputFiles: [mkInput(xlsx, "source.xlsx", XLSX_MIME)] },
        work
      );
      await assertResultShape(result);
      assert.equal(normExt(result.outputs[0].outputExtension), "txt");
      const text = await fs.readFile(result.outputs[0].outputPath, "utf8");
      assert.ok(text.includes("FROZEN XLSX TEXT"), "extracted text must contain the sheet text");
    });

    it("ocr on a pptx writes a .txt containing the slide text", async () => {
      const work = await newWork("ocr-pptx");
      const pptx = await makePptx(work, "source.pptx", "FROZEN PPTX TEXT");
      const result = await runProcess(
        { operation: "ocr", inputFiles: [mkInput(pptx, "source.pptx", PPTX_MIME)] },
        work
      );
      await assertResultShape(result);
      assert.equal(normExt(result.outputs[0].outputExtension), "txt");
      const text = await fs.readFile(result.outputs[0].outputPath, "utf8");
      assert.ok(text.includes("FROZEN PPTX TEXT"), "extracted text must contain the slide text");
    });

    it("ocr rejects a zip with UNSUPPORTED_FILE 400", async () => {
      const work = await newWork("ocr-zip");
      const zipFile = await makeZip(work, "source.zip");
      await assertRejected(
        runProcess(
          { operation: "ocr", inputFiles: [mkInput(zipFile, "source.zip", MIME_BY_EXTENSION[".zip"][0])] },
          work
        ),
        "UNSUPPORTED_FILE"
      );
    });
  });

  describe("password cases", () => {
    it("unlock on an encrypted PDF fails with PASSWORD_REQUIRED 400 and SECURE_ENCRYPTION_MESSAGE", async () => {
      const work = await newWork("pwd-unlock-pdf");
      const encrypted = await makeEncryptedPdf(work, "encrypted.pdf");
      await assertPasswordRequired(
        runProcess({ operation: "unlock", inputFiles: [mkInput(encrypted, "encrypted.pdf", "application/pdf")] }, work)
      );
    });

    it("compress on an encrypted PDF fails with PASSWORD_REQUIRED 400 and SECURE_ENCRYPTION_MESSAGE", async () => {
      const work = await newWork("pwd-compress-pdf");
      const encrypted = await makeEncryptedPdf(work, "encrypted.pdf");
      await assertPasswordRequired(
        runProcess({ operation: "compress", inputFiles: [mkInput(encrypted, "encrypted.pdf", "application/pdf")] }, work)
      );
    });

    it("rotate on an encrypted PDF fails with PASSWORD_REQUIRED 400 and SECURE_ENCRYPTION_MESSAGE", async () => {
      const work = await newWork("pwd-rotate-pdf");
      const encrypted = await makeEncryptedPdf(work, "encrypted.pdf");
      await assertPasswordRequired(
        runProcess(
          { operation: "rotate", rotationAngle: "90", inputFiles: [mkInput(encrypted, "encrypted.pdf", "application/pdf")] },
          work
        )
      );
    });

    it("merge with an encrypted PDF fails with PASSWORD_REQUIRED 400 and SECURE_ENCRYPTION_MESSAGE", async () => {
      const work = await newWork("pwd-merge-pdf");
      const encrypted = await makeEncryptedPdf(work, "encrypted.pdf");
      const plain = await makePdf(work, "plain.pdf", 1);
      await assertPasswordRequired(
        runProcess(
          {
            operation: "merge",
            inputFiles: [
              mkInput(encrypted, "encrypted.pdf", "application/pdf"),
              mkInput(plain, "plain.pdf", "application/pdf"),
            ],
          },
          work
        )
      );
    });

    it("unlock on an OLE-header docx fails with PASSWORD_REQUIRED 400 and SECURE_ENCRYPTION_MESSAGE", async () => {
      const work = await newWork("pwd-ole-docx");
      const ole = await makeOleFile(work, "encrypted.docx");
      await assertPasswordRequired(
        runProcess({ operation: "unlock", inputFiles: [mkInput(ole, "encrypted.docx", DOCX_MIME)] }, work)
      );
    });

    it("unlock on an OLE-header pptx fails with PASSWORD_REQUIRED 400 and SECURE_ENCRYPTION_MESSAGE", async () => {
      const work = await newWork("pwd-ole-pptx");
      const ole = await makeOleFile(work, "encrypted.pptx");
      await assertPasswordRequired(
        runProcess({ operation: "unlock", inputFiles: [mkInput(ole, "encrypted.pptx", PPTX_MIME)] }, work)
      );
    });

    it("unlock on an OLE-header xlsx fails with FILE_CORRUPTED 400, not PASSWORD_REQUIRED (observed contract, not the ideal)", async () => {
      // Observed contract, not the ideal. The contract names the OLE header as a password
      // detection site, which implies PASSWORD_REQUIRED, and the docx and pptx cases above answer
      // PASSWORD_REQUIRED. The same OLE-header file named .xlsx answers FILE_CORRUPTED 400 today.
      // This pins what the product does now so any change is visible; it does not endorse the
      // mapping. Owner decision still needed on the intended one.
      const work = await newWork("pwd-ole-xlsx");
      const ole = await makeOleFile(work, "encrypted.xlsx");
      const err = await assertRejected(
        runProcess({ operation: "unlock", inputFiles: [mkInput(ole, "encrypted.xlsx", XLSX_MIME)] }, work),
        "FILE_CORRUPTED"
      );
      assert.notEqual(
        err.message,
        SECURE_ENCRYPTION_MESSAGE,
        "the xlsx path does not answer PASSWORD_REQUIRED today, so it must not carry the secure message"
      );
    });

    it("unlock on a zip with the yauzl encryption bit fails with PASSWORD_REQUIRED 400 and SECURE_ENCRYPTION_MESSAGE", async () => {
      const work = await newWork("pwd-zip");
      const zipFile = await makeZip(work, "encrypted.zip");
      // An encrypted zip cannot be produced with the installed libraries, so the yauzl
      // reader is stubbed to report general purpose bit 0x1, the detection site named by
      // the contract. Nothing under test is stubbed.
      const stub = mock.method(yauzl, "open", (inputPath, options, callback) => {
        let cb = callback;
        if (typeof options === "function") cb = options;
        const fakeZipFile = {
          on: (event, handler) => {
            if (event === "entry") setImmediate(() => handler({ generalPurposeBitFlag: 0x1, fileName: "secret.txt" }));
          },
          readEntry: () => {},
          close: () => {},
        };
        setImmediate(() => cb(null, fakeZipFile));
      });
      try {
        await assertPasswordRequired(
          runProcess(
            { operation: "unlock", inputFiles: [mkInput(zipFile, "encrypted.zip", MIME_BY_EXTENSION[".zip"][0])] },
            work
          )
        );
      } finally {
        stub.mock.restore();
      }
    });
  });

  describe("operation dispatch", () => {
    it("OPERATION_MODES still lists the seven frozen operations", () => {
      for (const operation of FROZEN_OPERATIONS) {
        assert.ok(OPERATION_MODES.has(operation), `OPERATION_MODES lost ${operation}`);
      }
    });

    it("an unknown operation is rejected with UNSUPPORTED_FILE 400", async () => {
      const work = await newWork("op-unknown");
      const pdf = await makePdf(work, "source.pdf", 1);
      await assertRejected(
        runProcess(
          { operation: "invalidOp", inputFiles: [mkInput(pdf, "source.pdf", "application/pdf")] },
          work
        ),
        "UNSUPPORTED_FILE"
      );
    });

    it("a missing operation defaults to unlock", async () => {
      const work = await newWork("op-missing");
      const pdf = await makePdf(work, "source.pdf", 2);
      const result = await runProcess({ inputFiles: [mkInput(pdf, "source.pdf", "application/pdf")] }, work);
      await assertResultShape(result);
      assert.equal(normExt(result.outputs[0].outputExtension), "pdf");
      const doc = await PDFDocument.load(await fs.readFile(result.outputs[0].outputPath));
      assert.equal(doc.getPageCount(), 2);
    });

    it("a null operation defaults to unlock", async () => {
      const work = await newWork("op-null");
      const pdf = await makePdf(work, "source.pdf", 1);
      const result = await runProcess(
        { operation: null, inputFiles: [mkInput(pdf, "source.pdf", "application/pdf")] },
        work
      );
      await assertResultShape(result);
      assert.equal(normExt(result.outputs[0].outputExtension), "pdf");
    });

    it("an empty input list is rejected with UNSUPPORTED_FILE 400", async () => {
      for (const operation of ["unlock", "merge", "split", "rotate", "compress", "ocr"]) {
        const work = await newWork(`op-empty-${operation}`);
        await assertRejected(runProcess({ operation, inputFiles: [] }, work), "UNSUPPORTED_FILE");
      }
    });
  });

  // Two contract points cannot be observed through processFile: the rotate default is applied by
  // the route layer, and the HTTP response envelope is built by the route layer. Neither was
  // pinned by any test under tests/server/ (grep for downloadId / batchDownloadId returned
  // nothing), so both are pinned here through the real POST /process route, exactly as
  // tests/server/routes/files.test.js mounts it. The server listens on an ephemeral port, writes
  // its own uploads under server/tmp as the product does, and every fixture is generated in the
  // per-test temp directory.
  describe("HTTP boundary: rotate default and response envelope", () => {
    let appServer;
    let baseUrl;

    before(async () => {
      await ensureRuntimeDirectories();
      const app = express();
      app.use(express.json());
      app.use(express.urlencoded({ extended: true }));
      app.use(filesRouter);
      app.use(errorHandler);
      appServer = await new Promise((resolve, reject) => {
        const server = app.listen(0, () => resolve(server));
        server.on("error", reject);
      });
      baseUrl = `http://127.0.0.1:${appServer.address().port}`;
    });

    after(async () => {
      if (appServer) await new Promise((resolve) => appServer.close(() => resolve()));
    });

    async function postProcess(fields, files) {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) form.append(key, value);
      for (const file of files) {
        const bytes = await fs.readFile(file.filePath);
        form.append(file.fieldName, new Blob([bytes], { type: file.mimeType }), file.fileName);
      }
      const response = await fetch(`${baseUrl}/process`, { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      return { status: response.status, body };
    }

    it("rotate with no rotationAngle and no pages defaults to 90 on every page", async () => {
      // The 90 default lives above processFile: processFile rejects a missing rotationAngle with
      // UNSUPPORTED_FILE, and only the route supplies the default. Pinned here so the product
      // default named by AGENTS.md and README has a test.
      const work = await newWork("http-rotate-default");
      const pdf = await makePdf(work, "rotate.pdf", 3);
      const { status, body } = await postProcess(
        { operation: "rotate" },
        [{ fieldName: "files", filePath: pdf, fileName: "rotate.pdf", mimeType: "application/pdf" }]
      );
      assert.equal(status, 200, "an angle-less rotate must succeed at the HTTP boundary");
      assert.equal(body.status, "success");
      assert.ok(Array.isArray(body.results) && body.results.length === 1);
      assert.equal(body.results[0].detectedType, "PDF");
      const downloaded = await fetch(`${baseUrl}${body.results[0].downloadUrl}`);
      assert.equal(downloaded.status, 200);
      const doc = await PDFDocument.load(Buffer.from(await downloaded.arrayBuffer()));
      assert.equal(doc.getPageCount(), 3);
      assert.deepEqual(
        doc.getPages().map((page) => ((page.getRotation().angle % 360) + 360) % 360),
        [90, 90, 90]
      );
    });

    it("a single-output response carries results[] plus the downloadId and downloadUrl mirror, with null batch fields", async () => {
      const work = await newWork("http-envelope-single");
      const pdf = await makePdf(work, "split.pdf", 2);
      const { status, body } = await postProcess(
        { operation: "split", pageRanges: "1" },
        [{ fieldName: "files", filePath: pdf, fileName: "split.pdf", mimeType: "application/pdf" }]
      );
      assert.equal(status, 200);
      assert.equal(body.status, "success");
      assert.ok(Array.isArray(body.results), "the success body must carry a results[] array");
      assert.equal(body.results.length, 1);
      const result = body.results[0];
      for (const field of ["downloadId", "downloadName", "downloadUrl", "detectedType", "message"]) {
        assert.ok(field in result, `a result entry is missing the frozen field ${field}`);
      }
      assert.ok(typeof result.downloadId === "string" && result.downloadId.length > 0);
      assert.match(result.downloadName, /_part_1_page_1\.pdf$/);
      assert.equal(result.downloadUrl, `/download/${result.downloadId}`);
      assert.equal(body.downloadId, result.downloadId, "body.downloadId must mirror the first result");
      assert.equal(body.downloadUrl, result.downloadUrl, "body.downloadUrl must mirror the first result");
      assert.equal(body.batchDownloadId, null, "a single output must leave batchDownloadId null");
      assert.equal(body.batchDownloadName, null, "a single output must leave batchDownloadName null");
      assert.equal(body.batchDownloadUrl, null, "a single output must leave batchDownloadUrl null");
      const downloaded = await fetch(`${baseUrl}${body.downloadUrl}`);
      assert.equal(downloaded.status, 200, "the envelope downloadUrl must resolve to a real file");
    });

    it("a multi-output response fills results[] and the batchDownload fields", async () => {
      const work = await newWork("http-envelope-batch");
      const pdf = await makePdf(work, "split.pdf", 2);
      const { status, body } = await postProcess(
        { operation: "split", pageRanges: "1,2" },
        [{ fieldName: "files", filePath: pdf, fileName: "split.pdf", mimeType: "application/pdf" }]
      );
      assert.equal(status, 200);
      assert.equal(body.status, "success");
      assert.equal(body.results.length, 2);
      for (const result of body.results) {
        for (const field of ["downloadId", "downloadName", "downloadUrl", "detectedType", "message"]) {
          assert.ok(field in result, `a result entry is missing the frozen field ${field}`);
        }
        assert.equal(result.downloadUrl, `/download/${result.downloadId}`);
      }
      assert.notEqual(body.results[0].downloadId, body.results[1].downloadId, "each result needs its own download id");
      assert.equal(body.downloadId, body.results[0].downloadId, "body.downloadId must mirror the first result");
      assert.equal(body.downloadUrl, body.results[0].downloadUrl, "body.downloadUrl must mirror the first result");
      assert.ok(typeof body.batchDownloadId === "string" && body.batchDownloadId.length > 0, "a batch response needs batchDownloadId");
      assert.equal(body.batchDownloadUrl, `/download/${body.batchDownloadId}`);
      assert.ok(typeof body.batchDownloadName === "string" && body.batchDownloadName.length > 0, "a batch response needs batchDownloadName");
      const downloaded = await fetch(`${baseUrl}${body.batchDownloadUrl}`);
      assert.equal(downloaded.status, 200, "the batch download must resolve to a real file");
    });
  });
});
