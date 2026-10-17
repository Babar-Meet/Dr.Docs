// Convert-pairs contract test for the same-wave fix in the convert route of
// utils/processors/router.js. The wave reroutes three previously-failing declared pairs
// (.pdf -> txt, .pptx -> txt, .xlsx -> txt) through the existing text extractors, the same
// code the ocr operation runs, so they now write real .txt output.
//
// Authority: the wave dispatch plus AGENTS.md "FROZEN CORE CONTRACT" (required reading):
// convert accepts only the pairs declared in CONVERSION_TARGETS (utils/constants.js), and a
// declared pair may fail as PROCESSING_FAILED 500 but is never refused as UNSUPPORTED_FILE.
// Every case below drives processFile in utils/processors/router.js only, the same public
// boundary tests/contract/frozenBehaviour.test.js uses.
//
// What this file pins:
//   1. The three text-extractor pairs each produce one real non-empty .txt holding the
//      source text (critical: these pairs always failed before this wave).
//   2. The convert-to-txt result carries exactly the field-name set every other operation
//      returns at this boundary. The HTTP names downloadId/downloadName/downloadUrl are
//      route-layer renames of outputPath/outputName and downloadStore records; the envelope
//      itself is pinned by the HTTP boundary describe in frozenBehaviour.test.js. At the
//      processFile boundary the observable field names are the frozen seven
//      (outputPath, outputExtension, sourceName, outputName, detectedType, message,
//      mimeType), compared here against a real split result so convert-to-txt can never
//      drift to a different shape than the operations the frontend already consumes.
//      detectedType must be TXT and mimeType text/plain, exactly like ocr outputs.
//   3. Nothing else changed: docx -> txt, docx -> pdf and jpg -> webp still produce real
//      output, and targets outside CONVERSION_TARGETS are still refused with
//      UNSUPPORTED_FILE 400.
//   4. A small concrete expectation table classifies every declared pair; the test checks
//      the table against CONVERSION_TARGETS in both directions, so adding or removing any
//      declared pair in utils/constants.js fails the suite until the table is consciously
//      updated.
//
// Second wave (the pdf import infilter fix in the convert route): the declared pdf rows
// into docx, odt, rtf and pptx stopped failing with PROCESSING_FAILED. The fix loads a pdf
// through the LibreOffice pdf import filters (writer_pdf_import for the writer targets,
// impress_pdf_import for pptx, the same mechanism merge-to-docx already used) and then
// exports through the module's own filters. Each of those four rows is pinned below as a
// real-output row at the same public boundary: one output with the frozen field set, the
// real detected type and mime, a real converted container on disk, and the drawn source
// text read back out of that container. The three rows this build cannot convert (pdf ->
// xlsx, docx -> pptx, pptx -> docx) stay declared pairs: acceptance is pinned by the frozen
// suite, and this table carries no status that could ever score a build failure as a pass.
//
// Fixtures are generated per test with pdf-lib, JSZip, ExcelJS and sharp into a unique
// per-test temp directory. Nothing depends on Docs/ presence, file order or test order, and
// nothing touches server/tmp.
//
// A note on the PDF fixture: pdf-parse 1.1.4 (pdfjs v1.10.100) drops "bad XRef entry" /
// "Invalid PDF structure" when it reads a Node Buffer for files that stay inside the first
// 4096-byte named chunk, a measured environment fact on this machine (probe output at
// 2848 and ~1470 bytes failed, at 4107 bytes the same pdf-lib drawText content parsed and
// both page markers were extracted verbatim). The multi-page chunk-safe fixture below
// therefore draws repeat text rows until the file is comfortably past that boundary and
// refuses the fixture otherwise, so the pdft->txt case asserts real extraction and not a
// luck-shaped tiny file.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { spawnSync } from "node:child_process";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { processFile } from "../../utils/processors/router.js";
import { AppError } from "../../utils/errors.js";
import { CONVERSION_TARGETS, MIME_BY_EXTENSION } from "../../utils/constants.js";

const TMP_ROOT = path.join(os.tmpdir(), `drdocs-convert-pairs-${process.pid}-${Date.now()}`);
const QPDF_BIN = process.env.QPDF_BIN || "qpdf";
const LIBRE_BIN = process.env.LIBREOFFICE_BIN || "soffice";
const DOCX_MIME = MIME_BY_EXTENSION[".docx"][0];
const PPTX_MIME = MIME_BY_EXTENSION[".pptx"][0];
const XLSX_MIME = MIME_BY_EXTENSION[".xlsx"][0];
// Output mimes for the writer rows of the pdf import infilter wave. odt and rtf are not
// upload formats, so MIME_BY_EXTENSION does not declare them; these values are the ones
// the real processFile boundary returned in this round's conversion gateproof.
const ODT_OUTPUT_MIME = "application/vnd.oasis.opendocument.text";
const RTF_OUTPUT_MIME = "application/rtf";

// Expectation-table status names. "run-" statuses name pairs this file exercises with real
// output assertions; "declared-accepted" names declared pairs whose acceptance is pinned by
// the frozen suite and whose export success is build dependent. The rows that fail on this
// build (.pdf -> xlsx, .docx -> pptx, .pptx -> docx) stay declared-accepted rather than
// gaining a failed-pair status: their failure is a LibreOffice registry fact, so pinning it
// here would rot the suite on the first build that learns to convert them, while
// declared-accepted stays truthful in both worlds.
const RUN_TXT_TEXT = "run-txt-text";
const RUN_REAL_OUTPUT = "run-real-output";
const DECLARED_ACCEPTED = "declared-accepted";

const LEGAL_STATUSES = new Set([RUN_TXT_TEXT, RUN_REAL_OUTPUT, DECLARED_ACCEPTED]);

// The expectation table: every declared pair of CONVERSION_TARGETS in utils/constants.js,
// nothing more. The first wave's fix makes the four source-documents-to-text pairs
// run-proven; the pdf import infilter wave adds the four pdf-into-writer-and-impress rows
// (.pdf -> docx, odt, rtf, pptx) to the run-proven set, each with its real-output test in
// this file; docx -> pdf and jpg -> webp are the named proven regressions of the first
// story; every other declared pair stays declared-accepted, including the three rows this
// build cannot convert (.pdf -> xlsx, .docx -> pptx, .pptx -> docx).
const PAIR_STATUS = {
  ".pdf": {
    docx: RUN_REAL_OUTPUT,
    pptx: RUN_REAL_OUTPUT,
    xlsx: DECLARED_ACCEPTED,
    odt: RUN_REAL_OUTPUT,
    rtf: RUN_REAL_OUTPUT,
    txt: RUN_TXT_TEXT,
    html: DECLARED_ACCEPTED,
  },
  ".docx": {
    pdf: RUN_REAL_OUTPUT,
    odt: DECLARED_ACCEPTED,
    rtf: DECLARED_ACCEPTED,
    txt: RUN_TXT_TEXT,
    html: DECLARED_ACCEPTED,
    doc: DECLARED_ACCEPTED,
    epub: DECLARED_ACCEPTED,
    pptx: DECLARED_ACCEPTED,
  },
  ".pptx": {
    pdf: DECLARED_ACCEPTED,
    docx: DECLARED_ACCEPTED,
    odp: DECLARED_ACCEPTED,
    ppt: DECLARED_ACCEPTED,
    html: DECLARED_ACCEPTED,
    txt: RUN_TXT_TEXT,
  },
  ".xlsx": {
    pdf: DECLARED_ACCEPTED,
    ods: DECLARED_ACCEPTED,
    xls: DECLARED_ACCEPTED,
    csv: DECLARED_ACCEPTED,
    html: DECLARED_ACCEPTED,
    txt: RUN_TXT_TEXT,
  },
  ".jpg": {
    pdf: DECLARED_ACCEPTED,
    png: DECLARED_ACCEPTED,
    webp: RUN_REAL_OUTPUT,
    avif: DECLARED_ACCEPTED,
    tiff: DECLARED_ACCEPTED,
  },
  ".jpeg": {
    pdf: DECLARED_ACCEPTED,
    png: DECLARED_ACCEPTED,
    webp: DECLARED_ACCEPTED,
    avif: DECLARED_ACCEPTED,
    tiff: DECLARED_ACCEPTED,
  },
  ".png": {
    pdf: DECLARED_ACCEPTED,
    jpg: DECLARED_ACCEPTED,
    jpeg: DECLARED_ACCEPTED,
    webp: DECLARED_ACCEPTED,
    avif: DECLARED_ACCEPTED,
    tiff: DECLARED_ACCEPTED,
  },
};

// A missing soffice must never be scored as a pass. docx -> pdf and docx -> txt ran through
// LibreOffice before this wave and stay pinned through it, so when the probe fails the
// affected cases are skipped with an explicit reason, exactly like the soffice probe in
// tests/utils/processors/concurrentConversion.test.js. The four pdf import infilter rows
// and the two-route burst below are soffice-backed as well and skip under the same explicit
// reason. The three text-extractor pairs take the ocr extractor route (pdf-parse, the pptx
// slide xml parse, ExcelJS) and need no external binary, so they are never gated on
// LibreOffice.
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
  : `${LIBRE_BIN} --version did not exit 0, so no LibreOffice conversion can run here`;

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

function runProcess(options, workDir) {
  return processFile({
    qpdfBin: QPDF_BIN,
    libreOfficeBin: LIBRE_BIN,
    workDir,
    outputBasePath: path.join(workDir, "out"),
    ...options,
  });
}

const FROZEN_OUTPUT_FIELDS = [
  "outputPath",
  "outputExtension",
  "sourceName",
  "outputName",
  "detectedType",
  "message",
  "mimeType",
];

async function assertConvertToTxt(result, textPieces) {
  assert.ok(result && typeof result === "object", "result must be an object");
  assert.equal(typeof result.message, "string", "result.message must be a string");
  assert.ok(Array.isArray(result.outputs) && result.outputs.length === 1, "convert to txt must return exactly one output");
  const out = result.outputs[0];
  for (const field of FROZEN_OUTPUT_FIELDS) {
    assert.ok(field in out, `convert to txt output is missing the frozen field ${field}`);
  }
  assert.equal(normExt(out.outputExtension), "txt", "the declared txt pair must write a .txt file");
  assert.equal(out.detectedType, "TXT", "the txt output must be detected as TXT");
  assert.equal(out.mimeType, "text/plain", "the txt output must carry the text/plain mime, like ocr outputs");
  assert.ok(typeof out.sourceName === "string" && out.sourceName.length > 0, "sourceName must not be empty");
  // outputName is best-effort (frozenBehaviour uses out.outputName || basename(outputPath)
  // for exactly this reason); whichever it is, the name the route serves as downloadName must end in .txt.
  const servedName = out.outputName || path.basename(out.outputPath);
  assert.match(String(servedName), /\.txt$/i, "the name the route serves as downloadName must end in .txt");
  assert.ok(await fs.pathExists(out.outputPath), `output file does not exist: ${out.outputPath}`);
  const stat = await fs.stat(out.outputPath);
  assert.ok(stat.size > 0, "the txt output file must not be empty");
  const text = await fs.readFile(out.outputPath, "utf8");
  assert.ok(text.trim().length > 0, "the txt output must hold some text");
  for (const piece of textPieces) {
    assert.ok(
      text.includes(piece),
      `the txt output must hold the source text ${JSON.stringify(piece)}, got ${JSON.stringify(text.slice(0, 200))}`
    );
  }
}

// The infilter-wave convert rows share one shape check so every row keeps the frozen
// envelope and the served-name convention the txt rows pin (at the processFile boundary
// outputName is best effort; the route layer computes the `<base>_processed.<ext>`
// downloadName for convert outputs).
async function assertConvertRealOutput(result, targetExt, detectedType, mimeType) {
  assert.ok(result && typeof result === "object", "result must be an object");
  assert.equal(typeof result.message, "string", "result.message must be a string");
  assert.ok(
    Array.isArray(result.outputs) && result.outputs.length === 1,
    `convert to ${targetExt} must return exactly one output`
  );
  const out = result.outputs[0];
  for (const field of FROZEN_OUTPUT_FIELDS) {
    assert.ok(field in out, `convert to ${targetExt} output is missing the frozen field ${field}`);
  }
  assert.equal(normExt(out.outputExtension), targetExt, `a convert to ${targetExt} must name the ${targetExt} extension`);
  assert.equal(out.detectedType, detectedType, `the ${targetExt} output must be detected as ${detectedType}`);
  assert.equal(out.mimeType, mimeType, `the ${targetExt} output must carry the ${mimeType} mime`);
  assert.ok(typeof out.sourceName === "string" && out.sourceName.length > 0, "sourceName must not be empty");
  const servedName = out.outputName || path.basename(out.outputPath);
  assert.match(
    String(servedName),
    new RegExp(`\\.${targetExt}$`, "i"),
    `the name the route serves as downloadName must end in .${targetExt}`
  );
  assert.ok(await fs.pathExists(out.outputPath), `output file does not exist: ${out.outputPath}`);
  const stat = await fs.stat(out.outputPath);
  assert.ok(stat.size > 0, "the output file must not be empty");
  return out;
}

function xmlText(xml) {
  // Text node concatenation, the docx/odt/pptx readers' job: all text in document order.
  // The rows assert whole drawn lines, and the round's gateproof showed whole lines survive
  // as contiguous runs inside each container, even with tags replaced by separators.
  return String(xml).replace(/<[^>]*>/g, "");
}

async function assertDocxCarriesText(filePath, labels) {
  const bytes = await fs.readFile(filePath);
  assert.equal(bytes.subarray(0, 2).toString("latin1"), "PK", "a docx output must be a zip container (PK header)");
  const zip = await JSZip.loadAsync(bytes);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  assert.ok(documentXml, "the docx output must contain word/document.xml");
  const text = xmlText(documentXml);
  for (const label of labels) {
    assert.ok(
      text.includes(label),
      `the docx document text must hold ${JSON.stringify(label)}, got ${JSON.stringify(text.slice(0, 200))}`
    );
  }
}

async function assertOdtCarriesText(filePath, labels) {
  const bytes = await fs.readFile(filePath);
  assert.equal(bytes.subarray(0, 2).toString("latin1"), "PK", "an odt output must be a zip container (PK header)");
  const zip = await JSZip.loadAsync(bytes);
  const mimetype = await zip.file("mimetype")?.async("string");
  assert.equal(
    mimetype,
    ODT_OUTPUT_MIME,
    "the odt container must carry the OpenDocument text mimetype entry"
  );
  const contentXml = await zip.file("content.xml")?.async("string");
  assert.ok(contentXml, "the odt output must contain content.xml");
  const text = xmlText(contentXml);
  for (const label of labels) {
    assert.ok(
      text.includes(label),
      `the odt document text must hold ${JSON.stringify(label)}, got ${JSON.stringify(text.slice(0, 200))}`
    );
  }
}

async function assertRtfCarriesText(filePath, labels) {
  const text = (await fs.readFile(filePath)).toString("latin1");
  assert.ok(
    text.startsWith("{\\rtf1"),
    `an rtf output must start with the RTF header, got ${JSON.stringify(text.slice(0, 16))}`
  );
  for (const label of labels) {
    assert.ok(
      text.includes(label),
      `the rtf output must hold ${JSON.stringify(label)}, got ${JSON.stringify(text.slice(0, 200))}`
    );
  }
}

async function assertPptxCarriesText(filePath, labels) {
  const bytes = await fs.readFile(filePath);
  assert.equal(bytes.subarray(0, 2).toString("latin1"), "PK", "a pptx output must be a zip container (PK header)");
  const zip = await JSZip.loadAsync(bytes);
  const contentTypes = await zip.file("[Content_Types].xml")?.async("string");
  assert.ok(
    contentTypes && contentTypes.includes("application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"),
    "the pptx container must register the presentation part in [Content_Types].xml"
  );
  assert.ok(zip.file("ppt/presentation.xml"), "the pptx output must contain ppt/presentation.xml");
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort();
  assert.ok(slideNames.length >= 1, "the pptx output must contain at least one slide");
  let slideText = "";
  for (const slideName of slideNames) {
    slideText += xmlText(await zip.file(slideName).async("string"));
  }
  for (const label of labels) {
    assert.ok(
      slideText.includes(label),
      `the pptx slide text must hold ${JSON.stringify(label)}, got ${JSON.stringify(slideText.slice(0, 200))}`
    );
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
  assert.equal(outcome.statusCode, 400, "every refused input maps to status 400");
  return outcome;
}

async function makeChunkSafePdf(dir, name, baseMarker) {
  // Drawn text rows reproduce what pdf-parse extracts from real user PDFs; more pages are
  // appended until the saved file sits well past the first chunk boundary, because a
  // single-chunk file drops out of the pdf-parse Buffer parsing path even when it is valid
  // (qpdf validates it). The size gate makes any lost crossing loud instead of silent.
  const CHUNK_SAFE_BYTES = 4500;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let pageCount = 0;
  for (let page = 1; page <= 60; page++) {
    const docPage = doc.addPage([300, 400]);
    for (let row = 0; row <= 5; row++) {
      docPage.drawText(
        `${baseMarker} PAGE ${page} ROW ${row} FILLER LINE FOR PAGE COUNT SIZE`,
        { x: 20, y: 300 - row * 50, size: 12, font }
      );
    }
    const bytes = await doc.save();
    pageCount = page;
    if (bytes.length > CHUNK_SAFE_BYTES) {
      const filePath = path.join(dir, name);
      await fs.writeFile(filePath, bytes);
      const firstMarker = `${baseMarker} PAGE 1 ROW 0`;
      const lastMarker = `${baseMarker} PAGE ${pageCount} ROW 0`;
      assert.ok(
        bytes.length > 4096,
        `the pdf fixture must cross the chunk boundary, got ${bytes.length} bytes for ${name}`
      );
      return { filePath, firstMarker, lastMarker, bytes: bytes.length };
    }
  }
  assert.fail(`could not build a chunk-safe pdf fixture within 60 pages for ${name}`);
}

async function makeDrawnPdf(dir, name, marker) {
  // One-page drawn-text pdf for the LibreOffice pdf import rows: drawText produces real
  // text operators, which the pdf import filters land as document text (image-only pdfs
  // would not, and are not the fixture used here). The chunk-safe multi-page fixture stays
  // reserved for the pdf-parse route; the import filters have no chunk-reader restriction,
  // so this small fixture keeps four soffice-backed conversions reading real text.
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 300]);
  page.drawText(`${marker} LINE 1/1`, { x: 24, y: 220, size: 14, font });
  page.drawText(`${marker} SECOND DRAWN LINE`, { x: 24, y: 160, size: 14, font });
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, await doc.save());
  return {
    filePath,
    firstLine: `${marker} LINE 1/1`,
    secondLine: `${marker} SECOND DRAWN LINE`,
  };
}

async function makePlainPdf(dir, name, pages) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    doc.addPage([300, 400]);
  }
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, await doc.save());
  return filePath;
}

async function makeDocx(dir, name, text) {
  // The same structure as the proven JSZip docx fixture in frozenBehaviour.test.js minus the
  // unlock-protection markers: a plain user document opened by LibreOffice.
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
    `<?xml version="1.0"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:settings>`
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
  // The same wiring as the proven JSZip pptx fixture in frozenBehaviour.test.js minus the
  // unlock-protection markers: presentation rels point at slide1, the slide holds the text
  // in a drawingml a:t runs exactly like a real PowerPoint file.
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
    `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
  );
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, await zip.generateAsync({ type: "nodebuffer" }));
  return filePath;
}

async function makeXlsx(dir, name, text) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow([text]);
  const filePath = path.join(dir, name);
  await wb.xlsx.writeFile(filePath);
  return filePath;
}

async function makeJpeg(dir, name) {
  const sharp = (await import("sharp")).default;
  const buf = await sharp({
    create: { width: 24, height: 18, channels: 3, background: { r: 10, g: 120, b: 200 } },
  })
    .jpeg()
    .toBuffer();
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, buf);
  return filePath;
}

describe("convert to txt through the text extractors (this wave's fix)", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });
  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  it("convert pdf to txt produces real extracted text", async () => {
    // Wave fix, pair 1 of 3: .pdf -> txt must route through the same extractor the ocr
    // operation runs and write the page text, not a placeholder and not a failure.
    const work = await newWork("pdf-txt");
    const fixture = await makeChunkSafePdf(work, "source.pdf", "CONVERT PDF SOURCE MARKER");
    const result = await runProcess(
      {
        operation: "convert",
        targetFormat: "txt",
        inputFiles: [mkInput(fixture.filePath, "source.pdf", "application/pdf")],
      },
      work
    );
    await assertConvertToTxt(result, [fixture.firstMarker, fixture.lastMarker]);
  });

  it("convert pptx to txt produces real extracted text", async () => {
    // Wave fix, pair 2 of 3: .pptx -> txt reads the slide text the same way ocr does.
    const work = await newWork("pptx-txt");
    const source = await makePptx(work, "source.pptx", "CONVERT PPTX SOURCE MARKER");
    const result = await runProcess(
      {
        operation: "convert",
        targetFormat: "txt",
        inputFiles: [mkInput(source, "source.pptx", PPTX_MIME)],
      },
      work
    );
    await assertConvertToTxt(result, ["CONVERT PPTX SOURCE MARKER"]);
  });

  it("convert xlsx to txt produces real extracted text", async () => {
    // Wave fix, pair 3 of 3: .xlsx -> txt reads the sheet text the same way ocr does.
    const work = await newWork("xlsx-txt");
    const source = await makeXlsx(work, "source.xlsx", "CONVERT XLSX SOURCE MARKER");
    const result = await runProcess(
      {
        operation: "convert",
        targetFormat: "txt",
        inputFiles: [mkInput(source, "source.xlsx", XLSX_MIME)],
      },
      work
    );
    await assertConvertToTxt(result, ["CONVERT XLSX SOURCE MARKER"]);
  });

  it("two pdf to txt conversions in flight at once both produce real text and the input survives", async () => {
    // Same file converted twice at the same time from two work directories, both calls must
    // resolve with real text, and convert must leave the source file in place, since the
    // route never hands a ref-counted source path to one job per document alone.
    const work = await newWork("pdf-txt-burst");
    const fixture = await makeChunkSafePdf(work, "burst-source.pdf", "CONVERT PDF BURST MARKER");
    const dirA = path.join(work, "call-a");
    const dirB = path.join(work, "call-b");
    await fs.ensureDir(dirA);
    await fs.ensureDir(dirB);
    const call = (workDir) =>
      runProcess(
        {
          operation: "convert",
          targetFormat: "txt",
          inputFiles: [mkInput(fixture.filePath, "burst-source.pdf", "application/pdf")],
        },
        workDir
      );
    const [first, second] = await Promise.all([call(dirA), call(dirB)]);
    await assertConvertToTxt(first, [fixture.firstMarker, fixture.lastMarker]);
    await assertConvertToTxt(second, [fixture.firstMarker, fixture.lastMarker]);
    assert.notEqual(first.outputs[0].outputPath, second.outputs[0].outputPath, "the two calls must not share an output path");
    assert.ok(await fs.pathExists(fixture.filePath), "convert to txt must not consume its input file");
  });
});

describe("convert pdf into the writer and impress targets (pdf import infilter wave)", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });
  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  it("convert pdf to docx produces a real docx holding the drawn source text", { skip: SOFFICE_UNAVAILABLE }, async () => {
    // Infilter wave, row 1: the declared .pdf -> docx row used to fail with
    // PROCESSING_FAILED. The pdf import filter loads the document and the word processor
    // export writes it, so the row is pinned as a real-output row: detected DOCX, the docx
    // mime, a real zip container, and the drawn source text inside word/document.xml.
    const work = await newWork("pdf-docx");
    const fixture = await makeDrawnPdf(work, "source.pdf", "CONVERT PDF DOCX MARKER");
    const result = await runProcess(
      {
        operation: "convert",
        targetFormat: "docx",
        inputFiles: [mkInput(fixture.filePath, "source.pdf", "application/pdf")],
      },
      work
    );
    await assertConvertRealOutput(result, "docx", "DOCX", DOCX_MIME);
    await assertDocxCarriesText(result.outputs[0].outputPath, [fixture.firstLine, fixture.secondLine]);
  });

  it("convert pdf to odt produces a real odt holding the drawn source text", { skip: SOFFICE_UNAVAILABLE }, async () => {
    // Infilter wave, row 2: the same writer route with OpenDocument text output. The odt
    // mime is not an upload mime, so MIME_BY_EXTENSION does not declare it; the values
    // pinned here are the ones the real processFile boundary returned in the round's
    // conversion gateproof.
    const work = await newWork("pdf-odt");
    const fixture = await makeDrawnPdf(work, "source.pdf", "CONVERT PDF ODT MARKER");
    const result = await runProcess(
      {
        operation: "convert",
        targetFormat: "odt",
        inputFiles: [mkInput(fixture.filePath, "source.pdf", "application/pdf")],
      },
      work
    );
    await assertConvertRealOutput(result, "odt", "ODT", ODT_OUTPUT_MIME);
    await assertOdtCarriesText(result.outputs[0].outputPath, [fixture.firstLine, fixture.secondLine]);
  });

  it("convert pdf to rtf produces a real rtf holding the drawn source text", { skip: SOFFICE_UNAVAILABLE }, async () => {
    // Infilter wave, row 3: the writer route with Rich Text Format output. The rtf family
    // values (detected type RTF, the application/rtf mime) come from the same gateproof.
    const work = await newWork("pdf-rtf");
    const fixture = await makeDrawnPdf(work, "source.pdf", "CONVERT PDF RTF MARKER");
    const result = await runProcess(
      {
        operation: "convert",
        targetFormat: "rtf",
        inputFiles: [mkInput(fixture.filePath, "source.pdf", "application/pdf")],
      },
      work
    );
    await assertConvertRealOutput(result, "rtf", "RTF", RTF_OUTPUT_MIME);
    await assertRtfCarriesText(result.outputs[0].outputPath, [fixture.firstLine, fixture.secondLine]);
  });

  it("convert pdf to pptx produces a real pptx holding the drawn source text", { skip: SOFFICE_UNAVAILABLE }, async () => {
    // Infilter wave, row 4: the impress route. The pdf import filter here is
    // impress_pdf_import, the export runs through Impress' own pptx filter, and each
    // source page becomes one slide. Pinned: detected PPTX, the pptx mime, a real zip
    // container with the presentation part registered, at least one slide, and the drawn
    // text of page 1 inside the slides.
    const work = await newWork("pdf-pptx");
    const fixture = await makeDrawnPdf(work, "source.pdf", "CONVERT PDF PPTX MARKER");
    const result = await runProcess(
      {
        operation: "convert",
        targetFormat: "pptx",
        inputFiles: [mkInput(fixture.filePath, "source.pdf", "application/pdf")],
      },
      work
    );
    await assertConvertRealOutput(result, "pptx", "PPTX", PPTX_MIME);
    await assertPptxCarriesText(result.outputs[0].outputPath, [fixture.firstLine, fixture.secondLine]);
  });

  it("two pdf conversions in flight at once, to docx and to pptx, both produce real output and the input survives", { skip: SOFFICE_UNAVAILABLE }, async () => {
    // The two routes of this wave in one tick: the writer target and the impress target
    // each hold their own LibreOffice session against the same source pdf. Both calls must
    // resolve with a real converted document and must leave the shared input file in
    // place, like the txt burst above.
    const work = await newWork("pdf-burst-pairs");
    const fixture = await makeDrawnPdf(work, "burst-source.pdf", "CONVERT PDF PAIR BURST MARKER");
    const dirA = path.join(work, "call-a");
    const dirB = path.join(work, "call-b");
    await fs.ensureDir(dirA);
    await fs.ensureDir(dirB);
    const call = (target, workDir) =>
      runProcess(
        {
          operation: "convert",
          targetFormat: target,
          inputFiles: [mkInput(fixture.filePath, "burst-source.pdf", "application/pdf")],
        },
        workDir
      );
    const [toDocx, toPptx] = await Promise.all([call("docx", dirA), call("pptx", dirB)]);
    await assertConvertRealOutput(toDocx, "docx", "DOCX", DOCX_MIME);
    await assertConvertRealOutput(toPptx, "pptx", "PPTX", PPTX_MIME);
    await assertDocxCarriesText(toDocx.outputs[0].outputPath, [fixture.firstLine]);
    await assertPptxCarriesText(toPptx.outputs[0].outputPath, [fixture.firstLine]);
    assert.notEqual(
      toDocx.outputs[0].outputPath,
      toPptx.outputs[0].outputPath,
      "the two calls must not share an output path"
    );
    assert.ok(await fs.pathExists(fixture.filePath), "the burst conversions must not consume the shared input pdf");
  });
});

describe("convert response shape parity at the public boundary", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });
  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  it("convert to txt outputs carry exactly the field names other operations return", async () => {
    // Pin 2: the field-name set of a convert-to-txt output must equal the set another
    // operation returns at the same boundary, otherwise the route-layer envelope that turns
    // outputName into downloadName and outputPath into a downloadId for each entry starts
    // serving partial entries for the txt converts only. Compared against a real split run,
    // not a copied literal.
    const work = await newWork("shape-parity");
    const refPdf = await makePlainPdf(work, "reference.pdf", 2);
    const split = await runProcess(
      {
        operation: "split",
        pageRanges: "1",
        inputFiles: [mkInput(refPdf, "reference.pdf", "application/pdf")],
      },
      work
    );
    assert.ok(split.outputs.length === 1, "the reference split must return one output");
    const fixture = await makeChunkSafePdf(work, "parity-source.pdf", "CONVERT PDF SHAPE MARKER");
    const converted = await runProcess(
      {
        operation: "convert",
        targetFormat: "txt",
        inputFiles: [mkInput(fixture.filePath, "parity-source.pdf", "application/pdf")],
      },
      work
    );
    await assertConvertToTxt(converted, [fixture.firstMarker, fixture.lastMarker]);
    const splitKeys = Object.keys(split.outputs[0]).sort();
    const txtKeys = Object.keys(converted.outputs[0]).sort();
    assert.deepEqual(
      txtKeys,
      splitKeys,
      "convert to txt outputs must expose exactly the same field names the split operation returns"
    );
    for (const field of FROZEN_OUTPUT_FIELDS) {
      assert.ok(txtKeys.includes(field), `the frozen field ${field} must stay in the convert result`);
    }
  });
});

describe("nothing that already works stopped working", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });
  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  it("convert docx to txt still produces real text", { skip: SOFFICE_UNAVAILABLE }, async () => {
    // Declared-working pair before this wave (LibreOffice route), test 1: the pair must keep
    // producing a real txt holding the document text.
    const work = await newWork("docx-txt");
    const source = await makeDocx(work, "source.docx", "CONVERT DOCX REGRESSION MARKER");
    const result = await runProcess(
      {
        operation: "convert",
        targetFormat: "txt",
        inputFiles: [mkInput(source, "source.docx", DOCX_MIME)],
      },
      work
    );
    await assertConvertToTxt(result, ["CONVERT DOCX REGRESSION MARKER"]);
  });

  it("convert docx to pdf still produces a real pdf", { skip: SOFFICE_UNAVAILABLE }, async () => {
    // Declared-working pair before this wave (LibreOffice route), test 2: a real pdf.
    const work = await newWork("docx-pdf");
    const source = await makeDocx(work, "source.docx", "CONVERT DOCX PDF MARKER");
    const result = await runProcess(
      {
        operation: "convert",
        targetFormat: "pdf",
        inputFiles: [mkInput(source, "source.docx", DOCX_MIME)],
      },
      work
    );
    assert.ok(result && typeof result === "object", "result must be an object");
    assert.ok(Array.isArray(result.outputs) && result.outputs.length === 1, "convert docx to pdf must return one output");
    const out = result.outputs[0];
    assert.equal(normExt(out.outputExtension), "pdf", "the target extension must be pdf");
    assert.ok(await fs.pathExists(out.outputPath), "the pdf output file must exist");
    const stat = await fs.stat(out.outputPath);
    assert.ok(stat.size > 0, "the pdf output file must not be empty");
    const head = (await fs.readFile(out.outputPath)).subarray(0, 5).toString("latin1");
    assert.equal(head, "%PDF-", `convert docx to pdf must produce a pdf, got head ${JSON.stringify(head)}`);
  });

  it("convert jpg to webp still produces a real webp", async () => {
    // Declared-working pair before this wave (sharp route): a real webp container.
    const work = await newWork("jpg-webp");
    const source = await makeJpeg(work, "source.jpg");
    const result = await runProcess(
      {
        operation: "convert",
        targetFormat: "webp",
        inputFiles: [mkInput(source, "source.jpg", MIME_BY_EXTENSION[".jpg"][0])],
      },
      work
    );
    assert.ok(result && typeof result === "object", "result must be an object");
    assert.ok(Array.isArray(result.outputs) && result.outputs.length === 1, "convert jpg to webp must return one output");
    const out = result.outputs[0];
    assert.equal(normExt(out.outputExtension), "webp", "the target extension must be webp");
    assert.ok(await fs.pathExists(out.outputPath), "the webp output file must exist");
    const stat = await fs.stat(out.outputPath);
    assert.ok(stat.size > 0, "the webp output file must not be empty");
    const bytes = await fs.readFile(out.outputPath);
    assert.equal(bytes.subarray(0, 4).toString("latin1"), "RIFF", "a webp output must carry the RIFF marker");
    assert.equal(bytes.subarray(8, 12).toString("latin1"), "WEBP", "a webp output must carry the WEBP marker");
  });

  it("convert still refuses every undeclared target with UNSUPPORTED_FILE 400", async () => {
    // Sanitized slice of the frozen complement matrix: targets that other sources declare
    // but this source does not, plus a target declared nowhere. Any of them must be
    // refused before any conversion work happens, never processed.
    const work = await newWork("refusal");
    const source = await makePlainPdf(work, "refusal-source.pdf", 1);
    for (const target of ["epub", "csv", "webp", "zip"]) {
      assert.equal(
        CONVERSION_TARGETS[".pdf"].includes(target),
        false,
        `sanity: ${target} must stay undeclared for .pdf for this refusal case to exercise the complement`
      );
      await assertRejected(
        runProcess(
          {
            operation: "convert",
            targetFormat: target,
            inputFiles: [mkInput(source, "refusal-source.pdf", "application/pdf")],
          },
          work
        ),
        "UNSUPPORTED_FILE"
      );
    }
  });
});

describe("declared pair expectation table", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });
  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  it("the expectation table matches CONVERSION_TARGETS exactly in both directions", () => {
    // Pin 4: every declared pair is classified and every classified pair is declared, so
    // nothing can enter or leave CONVERSION_TARGETS in utils/constants.js without this test
    // naming the change. Sources are also exactly the supported upload extensions, and the
    // run-proven rows stay named: the four source-to-text pairs, the two named proven
    // regressions, and the four pdf-into-writer-and-impress rows of the infilter wave.
    const sources = [...Object.keys(CONVERSION_TARGETS)].sort();
    const tableSources = [...Object.keys(PAIR_STATUS)].sort();
    assert.deepEqual(tableSources, sources, "PAIR_STATUS sources must equal the CONVERSION_TARGETS sources exactly");
    for (const sourceExt of sources) {
      const targets = CONVERSION_TARGETS[sourceExt];
      assert.ok(Array.isArray(targets) && targets.length > 0, `${sourceExt} must declare at least one target`);
      for (const target of targets) {
        assert.equal(
          targets.filter((entry) => entry === target).length,
          1,
          `${sourceExt} must not declare ${target} twice`
        );
        const expected = PAIR_STATUS[sourceExt];
        assert.ok(
          Object.prototype.hasOwnProperty.call(expected, target),
          `PAIR_STATUS is missing the declared pair ${sourceExt} -> ${target}`
        );
        const status = expected[target];
        assert.ok(
          LEGAL_STATUSES.has(status),
          `PAIR_STATUS names an unknown status ${JSON.stringify(status)} for ${sourceExt} -> ${target}`
        );
      }
      const tableTargets = [...Object.keys(PAIR_STATUS[sourceExt])].sort();
      assert.deepEqual(tableTargets, [...targets].sort(), `PAIR_STATUS targets must equal the declared targets for ${sourceExt}`);
    }
    const textPairs = [];
    const outputPairs = [];
    for (const sourceExt of sources) {
      for (const target of Object.keys(PAIR_STATUS[sourceExt])) {
        const status = PAIR_STATUS[sourceExt][target];
        if (status === RUN_TXT_TEXT) {
          assert.equal(target, "txt", `${RUN_TXT_TEXT} status is reserved for txt targets, found on ${sourceExt} -> ${target}`);
          textPairs.push(`${sourceExt}->${target}`);
        }
        if (status === RUN_REAL_OUTPUT) {
          assert.notEqual(
            target,
            "txt",
            `${RUN_REAL_OUTPUT} status never applies to txt targets, they are ${RUN_TXT_TEXT}`
          );
          outputPairs.push(`${sourceExt}->${target}`);
        }
      }
    }
    assert.deepEqual(
      textPairs.sort(),
      [".docx->txt", ".pdf->txt", ".pptx->txt", ".xlsx->txt"],
      "the txt extractor route must stay pinned on exactly the four text-bearing sources"
    );
    assert.deepEqual(
      outputPairs.sort(),
      [".docx->pdf", ".jpg->webp", ".pdf->docx", ".pdf->odt", ".pdf->pptx", ".pdf->rtf"],
      "the run-proven non-txt pairs of this suite must stay named, one real-output test per row"
    );
  });
});
