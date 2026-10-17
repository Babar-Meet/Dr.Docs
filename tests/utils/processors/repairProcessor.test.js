// Acceptance tests for the new repair operation, from Temp/STORIES.md wave 1:
//   "Fix my broken PDF" (Major) and "Fix my broken Office, ZIP or image file" (Major).
//
// Contract asserted here:
//   - repair returns a file with the same extension as the input, for pdf, docx, pptx,
//     xlsx, zip, jpg, jpeg and png, and the returned file is readable again.
//   - input that cannot be repaired fails with FILE_CORRUPTED 400, never a 500 and never
//     a phantom success.
//   - repair is additive: unlock, compress and convert keep their frozen behaviour.
//
// Everything is driven through processFile in utils/processors/router.js. Fixtures come
// from pdf-lib, JSZip, ExcelJS and sharp, written under a unique per-test temp directory.
// No test depends on another, on order, or on a sleep.
//
// A missing qpdf must never be scored as a pass. Without the binary a spawn failure maps to the
// same FILE_CORRUPTED 400 the refuse cases expect, so the nine garbage and empty cases would go
// green for the wrong reason. qpdf is probed once with "--version"; when the probe does not exit
// 0 those nine cases are skipped with an explicit reason so the absence stays visible in TAP.
// This is the same convention as the soffice probe in concurrentConversion.test.js.
//
// Not covered, and why:
//   - "drop a damaged Office, ZIP or image file" has no defined notion of "damaged but
//     repairable" in the story, so for those formats the in/out contract is asserted with
//     a valid container that must come back readable plus an unrepairable input that must
//     be refused. The PDF damage case is explicit in the story and is asserted as such.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "fs-extra";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { processFile } from "../../../utils/processors/router.js";
import { AppError } from "../../../utils/errors.js";
import { MIME_BY_EXTENSION, OPERATION_MODES, SECURE_ENCRYPTION_MESSAGE } from "../../../utils/constants.js";

const TMP_ROOT = path.join(os.tmpdir(), `drdocs-repair-${Date.now()}`);
const QPDF_BIN = process.env.QPDF_BIN || "qpdf";
const LIBRE_BIN = process.env.LIBREOFFICE_BIN || "soffice";
const REPAIR_TYPES = [".pdf", ".docx", ".pptx", ".xlsx", ".zip", ".jpg", ".jpeg", ".png"];
const FROZEN_OPERATIONS = ["unlock", "convert", "merge", "split", "ocr", "rotate", "compress"];
const PROBE_TIMEOUT_MS = 60000;

function qpdfIsRunnable(bin) {
  const probe = spawnSync(bin, ["--version"], {
    encoding: "utf8",
    timeout: PROBE_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (probe.error) return false;
  return probe.status === 0;
}

const QPDF_UNAVAILABLE = qpdfIsRunnable(QPDF_BIN)
  ? false
  : `${QPDF_BIN} --version did not exit 0, so a missing qpdf cannot be told apart from FILE_CORRUPTED`;

let workSeq = 0;
async function newWork(label) {
  const dir = path.join(TMP_ROOT, `${label}-${workSeq++}`);
  // The processor writes into the parent directory of outputBasePath and does not create it,
  // so every work directory needs an existing "outputs" directory below it.
  await fs.ensureDir(path.join(dir, "outputs"));
  return dir;
}

async function listFilesRecursive(dir) {
  if (!(await fs.pathExists(dir))) return [];
  const found = [];
  for (const entry of await fs.readdir(dir)) {
    const full = path.join(dir, entry);
    const stat = await fs.stat(full);
    if (stat.isDirectory()) found.push(...(await listFilesRecursive(full)));
    else found.push(full);
  }
  return found;
}

function normExt(ext) {
  return String(ext).replace(/^\./, "").toLowerCase();
}

function mkInput(filePath, originalName, mimeType) {
  return { path: filePath, originalName, mimeType };
}

async function runRepair(filePath, originalName, work, outDir) {
  return processFile({
    operation: "repair",
    inputFiles: [mkInput(filePath, originalName, MIME_BY_EXTENSION[path.extname(originalName).toLowerCase()][0])],
    outputBasePath: path.join(outDir, "repaired"),
    workDir: work,
    qpdfBin: QPDF_BIN,
    libreOfficeBin: LIBRE_BIN,
  });
}

async function assertRepairShape(result, expectedExt) {
  assert.ok(result && typeof result === "object", "repair must return a result object");
  assert.equal(typeof result.message, "string", "result.message must be a string");
  assert.ok(Array.isArray(result.outputs) && result.outputs.length === 1, "repair returns exactly one output");
  const out = result.outputs[0];
  assert.equal(normExt(out.outputExtension), normExt(expectedExt), "repair must keep the input extension");
  assert.ok(await fs.pathExists(out.outputPath), `repaired file does not exist: ${out.outputPath}`);
  assert.ok((await fs.stat(out.outputPath)).size > 0, "repaired file must not be empty");
  assert.equal(typeof out.message, "string");
  return out;
}

async function expectFileCorrupted(run, label) {
  const outcome = await run().then(
    (result) => result,
    (err) => err
  );
  if (!(outcome instanceof Error)) {
    const names = (outcome.outputs || []).map((out) => out.outputName || out.outputPath);
    assert.fail(`repair reported a phantom success for ${label}: ${JSON.stringify(names)}`);
  }
  assert.ok(outcome instanceof AppError, `expected an AppError for ${label}, got ${outcome.constructor.name}`);
  assert.equal(outcome.code, "FILE_CORRUPTED", `${label} must fail with FILE_CORRUPTED`);
  assert.equal(outcome.statusCode, 400, `${label} must be a 400, never a 500`);
  return outcome;
}

// AGENTS.md, section FROZEN CORE CONTRACT, repair bullet: a password-protected PDF returns
// PASSWORD_REQUIRED with SECURE_ENCRYPTION_MESSAGE as its message, never FILE_CORRUPTED, and
// strong encryption is never bypassed on any type.
async function expectPasswordRequired(run, label) {
  const outcome = await run().then(
    (result) => result,
    (err) => err
  );
  if (!(outcome instanceof Error)) {
    const names = (outcome.outputs || []).map((out) => out.outputName || out.outputPath);
    assert.fail(`repair reported a phantom success for ${label}: ${JSON.stringify(names)}`);
  }
  assert.ok(outcome instanceof AppError, `expected an AppError for ${label}, got ${outcome.constructor.name}`);
  assert.equal(outcome.code, "PASSWORD_REQUIRED", `${label} must fail with PASSWORD_REQUIRED`);
  assert.equal(outcome.statusCode, 400, `${label} must be a 400, never a 500`);
  assert.equal(outcome.message, SECURE_ENCRYPTION_MESSAGE, `${label} must carry SECURE_ENCRYPTION_MESSAGE`);
  return outcome;
}

// A failed repair must not leave a half-written file behind. A zero-length placeholder does not
// count as half-written output; a non-empty file that was never reported does.
async function assertNoLeftoverOutput(outDir, before) {
  const created = (await listFilesRecursive(outDir)).filter((file) => !before.includes(file));
  for (const file of created) {
    const stat = await fs.stat(file);
    assert.equal(stat.size, 0, `a failed repair left a non-empty file behind: ${file}`);
  }
}

// A successful repair must produce exactly the files it reported, and nothing else.
async function assertOnlyReportedOutput(outDir, before, outputs) {
  const created = (await listFilesRecursive(outDir)).filter((file) => !before.includes(file));
  assert.deepEqual(
    created.slice().sort(),
    outputs.map((out) => out.outputPath).slice().sort(),
    "repair must produce exactly the reported output files, nothing else"
  );
}

async function makePdf(dir, name, pages = 2, options = {}) {
  const { marker = null, useObjectStreams = false } = options;
  const doc = await PDFDocument.create();
  const font = marker ? await doc.embedFont("Helvetica") : null;
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([300, 400]);
    if (marker && i === 0) page.drawText(marker, { x: 20, y: 200, size: 12, font });
  }
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, await doc.save({ useObjectStreams }));
  return filePath;
}

// A password-protected PDF is generated with qpdf in the per-test temp directory. Docs/ is
// gitignored and absent on a clean checkout, so no fixture is read from Docs/pdf/locked/enc.pdf;
// qpdf writes the same encrypted container here and the test stays self-contained.
async function makeEncryptedPdf(dir, name) {
  const source = await makePdf(dir, `${path.parse(name).name}-source.pdf`, 2);
  const target = path.join(dir, name);
  execFileSync(QPDF_BIN, ["--encrypt", "user-secret", "owner-secret", "256", "--", source, target]);
  const bytes = await fs.readFile(target);
  assert.ok(bytes.length > 0, "encrypted fixture must be written by qpdf");
  assert.equal(bytes.toString("latin1", 0, 5), "%PDF-", "encrypted fixture must be a PDF");
  return target;
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
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, await zip.generateAsync({ type: "nodebuffer" }));
  return filePath;
}

async function makePptx(dir, name) {
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
    `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst></p:presentation>`
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`
  );
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree/></p:cSld></p:sld>`
  );
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, await zip.generateAsync({ type: "nodebuffer" }));
  return filePath;
}

async function makeXlsx(dir, name, text) {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Sheet1").addRow([text]);
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

async function makeFixture(work, ext) {
  switch (ext) {
    case ".pdf":
      return makePdf(work, "source.pdf", 2, { marker: "REPAIR SOURCE TEXT" });
    case ".docx":
      return makeDocx(work, "source.docx", "REPAIR DOCX TEXT");
    case ".pptx":
      return makePptx(work, "source.pptx");
    case ".xlsx":
      return makeXlsx(work, "source.xlsx", "REPAIR XLSX TEXT");
    case ".zip":
      return makeZip(work, "source.zip");
    case ".jpg":
    case ".jpeg":
      return makeImage(work, `source${ext}`, "jpeg");
    case ".png":
      return makeImage(work, "source.png", "png");
    default:
      throw new Error(`no repair fixture builder for ${ext}`);
  }
}

async function assertReadableAgain(ext, out) {
  const bytes = await fs.readFile(out.outputPath);
  switch (ext) {
    case ".pdf": {
      const doc = await PDFDocument.load(bytes);
      assert.ok(doc.getPageCount() >= 1, "repaired PDF must still have a page");
      break;
    }
    case ".docx":
    case ".pptx":
    case ".xlsx": {
      const zip = await JSZip.loadAsync(bytes);
      const mainPart =
        ext === ".docx" ? "word/document.xml" : ext === ".pptx" ? "ppt/presentation.xml" : "xl/workbook.xml";
      assert.ok(zip.file(mainPart), `repaired ${ext} must still contain ${mainPart}`);
      if (ext === ".xlsx") {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(out.outputPath);
        assert.ok(wb.worksheets.length > 0, "repaired xlsx must still have a worksheet");
      }
      break;
    }
    case ".zip": {
      const zip = await JSZip.loadAsync(bytes);
      assert.ok(Object.keys(zip.files).length > 0, "repaired zip must still have entries");
      break;
    }
    case ".jpg":
    case ".jpeg":
    case ".png": {
      const sharp = (await import("sharp")).default;
      const meta = await sharp(out.outputPath).metadata();
      const expected = ext === ".png" ? "png" : "jpeg";
      assert.equal(meta.format, expected, `repaired ${ext} must still be a ${expected}`);
      assert.ok(meta.width > 0 && meta.height > 0);
      break;
    }
    default:
      throw new Error(`no readability check for ${ext}`);
  }
}

describe("repairProcessor: repair operation", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });
  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  describe("repair keeps the input extension and returns a readable file", () => {
    for (const ext of REPAIR_TYPES) {
      it(`repair ${ext} returns a readable ${ext}`, async () => {
        const work = await newWork(`repair-${normExt(ext)}`);
        const outDir = path.join(work, "outputs");
        const source = await makeFixture(work, ext);
        const before = await listFilesRecursive(outDir);
        const result = await runRepair(source, `source${ext}`, work, outDir);
        const out = await assertRepairShape(result, ext);
        await assertReadableAgain(ext, out);
        await assertOnlyReportedOutput(outDir, before, result.outputs);
      });
    }
  });

  describe("repair fixes a damaged PDF", () => {
    it("repair of a PDF missing its EOF marker returns a PDF that opens with pdf-lib", async () => {
      const work = await newWork("repair-damaged-pdf");
      const outDir = path.join(work, "outputs");
      const source = await makePdf(work, "damaged.pdf", 4, { marker: "REPAIR DAMAGED TEXT" });
      const full = await fs.readFile(source);
      const latin = full.toString("latin1");
      const eofIndex = latin.lastIndexOf("%%EOF");
      assert.ok(eofIndex > 0, "fixture must contain an EOF marker to remove");
      const damaged = path.join(work, "damaged-no-eof.pdf");
      await fs.writeFile(damaged, full.subarray(0, eofIndex));

      const result = await runRepair(damaged, "damaged-no-eof.pdf", work, outDir);
      const out = await assertRepairShape(result, ".pdf");
      const bytes = await fs.readFile(out.outputPath);
      assert.ok(bytes.length > 0, "repaired PDF must be non-empty");
      const doc = await PDFDocument.load(bytes);
      assert.equal(doc.getPageCount(), 4, "repair must not drop pages");
    });

    it("repair of a PDF truncated mid-body returns a PDF that opens and is non-empty", async () => {
      // A file cut off before its earlier objects is the hard repairable case: qpdf rebuilds what
      // it can reach, so the contract is that a PDF comes back and opens, not that every page
      // survives. Page recovery for this fixture is partial by measurement (2 of 4), so the
      // assertion is the story's own: the returned file opens with pdf-lib and is non-empty.
      const work = await newWork("repair-truncated-pdf");
      const outDir = path.join(work, "outputs");
      const source = await makePdf(work, "source.pdf", 4);
      const full = await fs.readFile(source);
      const truncated = path.join(work, "truncated.pdf");
      await fs.writeFile(truncated, full.subarray(0, Math.floor(full.length * 0.6)));
      const before = await listFilesRecursive(outDir);

      const result = await runRepair(truncated, "truncated.pdf", work, outDir);
      const out = await assertRepairShape(result, ".pdf");
      const bytes = await fs.readFile(out.outputPath);
      assert.ok(bytes.length > 0, "repaired PDF must be non-empty");
      const doc = await PDFDocument.load(bytes);
      assert.ok(doc.getPageCount() >= 1, "repaired PDF must still have at least one page");
      await assertOnlyReportedOutput(outDir, before, result.outputs);
    });
  });

  describe("repair refuses input it cannot repair", () => {
    for (const ext of REPAIR_TYPES) {
      it(`repair of garbage bytes named ${ext} fails with FILE_CORRUPTED 400 and no output file`, { skip: QPDF_UNAVAILABLE }, async () => {
        const work = await newWork(`repair-garbage-${normExt(ext)}`);
        const outDir = path.join(work, "outputs");
        const bad = path.join(work, `broken${ext}`);
        await fs.writeFile(bad, Buffer.from(`this is not a valid ${ext} document at all`));
        const before = await listFilesRecursive(outDir);
        await expectFileCorrupted(() => runRepair(bad, `broken${ext}`, work, outDir), `garbage ${ext}`);
        await assertNoLeftoverOutput(outDir, before);
      });
    }

    it("repair of an empty file fails with FILE_CORRUPTED 400", { skip: QPDF_UNAVAILABLE }, async () => {
      const work = await newWork("repair-empty");
      const outDir = path.join(work, "outputs");
      const empty = path.join(work, "empty.pdf");
      await fs.writeFile(empty, Buffer.alloc(0));
      const before = await listFilesRecursive(outDir);
      await expectFileCorrupted(() => runRepair(empty, "empty.pdf", work, outDir), "empty pdf");
      await assertNoLeftoverOutput(outDir, before);
    });

    it("repair of a password-protected PDF fails with PASSWORD_REQUIRED 400 and SECURE_ENCRYPTION_MESSAGE", { skip: QPDF_UNAVAILABLE }, async () => {
      const work = await newWork("repair-encrypted-pdf");
      const outDir = path.join(work, "outputs");
      const encrypted = await makeEncryptedPdf(work, "encrypted.pdf");
      const before = await listFilesRecursive(outDir);
      await expectPasswordRequired(() => runRepair(encrypted, "encrypted.pdf", work, outDir), "encrypted pdf");
      await assertNoLeftoverOutput(outDir, before);
    });

    it("repair of a docx container with no main parts fails with FILE_CORRUPTED 400", async () => {
      const work = await newWork("repair-broken-docx");
      const outDir = path.join(work, "outputs");
      const zip = new JSZip();
      zip.file("[Content_Types].xml", "<Types/>");
      const hollow = path.join(work, "hollow.docx");
      await fs.writeFile(hollow, await zip.generateAsync({ type: "nodebuffer" }));
      const before = await listFilesRecursive(outDir);
      await expectFileCorrupted(() => runRepair(hollow, "hollow.docx", work, outDir), "docx without main parts");
      await assertNoLeftoverOutput(outDir, before);
    });

    it("repair rejects an unsupported extension with UNSUPPORTED_FILE 400", async () => {
      const work = await newWork("repair-txt");
      const outDir = path.join(work, "outputs");
      const txt = path.join(work, "note.txt");
      await fs.writeFile(txt, "hello");
      const outcome = await processFile({
        operation: "repair",
        inputFiles: [mkInput(txt, "note.txt", "text/plain")],
        outputBasePath: path.join(outDir, "repaired"),
        workDir: work,
        qpdfBin: QPDF_BIN,
        libreOfficeBin: LIBRE_BIN,
      }).then(
        (result) => result,
        (err) => err
      );
      assert.ok(outcome instanceof AppError, "repair of a .txt must be refused");
      assert.equal(outcome.code, "UNSUPPORTED_FILE");
      assert.equal(outcome.statusCode, 400);
    });

    it("repair with no input files is refused", async () => {
      const work = await newWork("repair-no-files");
      const outcome = await processFile({
        operation: "repair",
        inputFiles: [],
        outputBasePath: path.join(work, "outputs", "repaired"),
        workDir: work,
        qpdfBin: QPDF_BIN,
        libreOfficeBin: LIBRE_BIN,
      }).then(
        (result) => result,
        (err) => err
      );
      assert.ok(outcome instanceof AppError, "repair with no files must be refused");
      assert.equal(outcome.code, "UNSUPPORTED_FILE");
      assert.equal(outcome.statusCode, 400);
    });
  });

  describe("repair is additive: the frozen seven keep their behaviour", () => {
    it("OPERATION_MODES still contains every frozen operation", () => {
      for (const operation of FROZEN_OPERATIONS) {
        assert.ok(OPERATION_MODES.has(operation), `OPERATION_MODES lost ${operation}`);
      }
    });

    it("unlock still keeps the input extension", async () => {
      const work = await newWork("additive-unlock");
      const pdf = await makePdf(work, "plain.pdf", 2);
      const result = await processFile({
        operation: "unlock",
        inputFiles: [mkInput(pdf, "plain.pdf", "application/pdf")],
        outputBasePath: path.join(work, "outputs", "unlocked"),
        workDir: work,
        qpdfBin: QPDF_BIN,
      });
      assert.equal(result.outputs.length, 1);
      assert.equal(normExt(result.outputs[0].outputExtension), "pdf");
      const doc = await PDFDocument.load(await fs.readFile(result.outputs[0].outputPath));
      assert.equal(doc.getPageCount(), 2);
    });

    it("compress still runs the frozen lossless qpdf flags", async () => {
      const work = await newWork("additive-compress");
      const pdf = await makePdf(work, "plain.pdf", 2);
      const result = await processFile({
        operation: "compress",
        inputFiles: [mkInput(pdf, "plain.pdf", "application/pdf")],
        outputBasePath: path.join(work, "outputs", "compressed"),
        workDir: work,
        qpdfBin: QPDF_BIN,
      });
      assert.equal(result.outputs.length, 1);
      const bytes = (await fs.readFile(result.outputs[0].outputPath)).toString("latin1");
      assert.ok(bytes.slice(0, 1024).includes("/Linearized"), "qpdf --linearize must still run");
      assert.ok(bytes.includes("/ObjStm"), "qpdf --object-streams=generate must still run");
    });

    it("convert still produces the declared target format", async () => {
      const work = await newWork("additive-convert");
      const png = await makeImage(work, "source.png", "png");
      const result = await processFile({
        operation: "convert",
        targetFormat: "jpg",
        inputFiles: [mkInput(png, "source.png", "image/png")],
        outputBasePath: path.join(work, "outputs", "converted"),
        workDir: work,
        libreOfficeBin: LIBRE_BIN,
      });
      assert.equal(result.outputs.length, 1);
      assert.equal(normExt(result.outputs[0].outputExtension), "jpg");
      const sharp = (await import("sharp")).default;
      assert.equal((await sharp(result.outputs[0].outputPath).metadata()).format, "jpeg");
    });
  });
});
