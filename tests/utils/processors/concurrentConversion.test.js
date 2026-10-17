// Acceptance test for a real defect fixed in the same wave: every soffice invocation used
// one shared LibreOffice user profile, while server/src/routes/files.js allows two
// conversions in flight at once (AsyncTaskQueue(2)).
//
// The defect is resource contention, so it is intermittent and load dependent: with one
// shared profile, simultaneous soffice processes collide, and a colliding call rejects with
// PROCESSING_FAILED and the reason "soffice exited with code 1". Two conversions at once did
// not collide on this machine; the load that does reproduce it is recorded below. The
// two-at-once case still runs 3 times, because that is the shape the product contract
// allows, and the burst case is the one that fails on the broken code.
//
// Asserted here, at the public boundary of convertWithLibreOffice in
// utils/processors/conversionProcessor.js:
//   1. two conversions started in the same tick, to different targets, both resolve and
//      both write a real non-empty output file (3 repetitions),
//   2. six conversions started in the same tick all resolve and all write a real non-empty
//      output file,
//   3. one conversion on its own still resolves and still writes a real non-empty output
//      file, so the fix cannot have broken the simple path.
//
// Why case 2 exists, measured on this machine before the fix landed (pre-fix revision at
// HEAD, run in an isolated worktree): two at once never failed, because LibreOffice starts
// one instance and the second process hands its request to it. At four at once one job of
// four failed in 2 of 2 rounds; at six at once two jobs of six failed in 2 of 2 rounds,
// every time with PROCESSING_FAILED "soffice exited with code 1". The same burst is green
// after the fix. So the two-at-once case is the required baseline and the burst is the case
// that actually separates the fixed code from the broken code. Both are kept: the baseline
// pins the product contract (AsyncTaskQueue(2) allows two jobs in flight), the burst is the
// defect pin. The product can put more than two soffice processes in flight, because every
// job above the queue may convert several documents of its own.
//
// Nothing here reads the implementation and nothing asserts which user profile directory
// was chosen. Only observable behaviour is asserted: conversions at the same time all
// succeed and all leave a real file behind.
//
// Fixtures: an ExcelJS workbook written into a unique per-test temp directory, so nothing
// is written into server/tmp and no test depends on another test or on execution order.
// Docs/ is gitignored and absent on a clean checkout, so no fixture is read from it.
// The source is .xlsx because LibreOffice opens a workbook written by ExcelJS reliably; a
// hand-built JSZip docx is rejected by LibreOffice, which was observed before the fixture
// was changed to xlsx. Targets pdf and html are two pairs the frozen contract lists for
// .xlsx in utils/constants.js CONVERSION_TARGETS, so neither target invents an accepted
// input that the contract does not have.
//
// Missing binary: sibling processor tests swallow PROCESSING_FAILED, which scores a missing
// soffice as a pass and would also hide this defect. Here soffice is probed once with
// "--version"; when the probe does not exit 0, every case is skipped with an explicit
// reason, so absence stays visible in TAP and is never counted as a pass, and nothing can
// hang waiting for a binary that is not installed. No sleeps, no retries, no setTimeout:
// both promises are created in the same tick and real concurrency does the rest.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { spawnSync } from "node:child_process";
import ExcelJS from "exceljs";
import { convertWithLibreOffice } from "../../../utils/processors/conversionProcessor.js";

const LIBRE_BIN = process.env.LIBREOFFICE_BIN || "soffice";
const TMP_ROOT = path.join(
  os.tmpdir(),
  `drdocs-concurrent-convert-${process.pid}-${Date.now()}`
);
const REPETITIONS = [1, 2, 3];
const BURST = 6;
const PROBE_TIMEOUT_MS = 60000;

function libreOfficeIsRunnable(bin) {
  const probe = spawnSync(bin, ["--version"], {
    encoding: "utf8",
    timeout: PROBE_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (probe.error) return false;
  return probe.status === 0;
}

const UNAVAILABLE = libreOfficeIsRunnable(LIBRE_BIN)
  ? false
  : `${LIBRE_BIN} --version did not exit 0, so no LibreOffice conversion can run here`;

function describeOutcomes(settled, targets) {
  return settled
    .map((outcome, index) => {
      if (outcome.status === "fulfilled") {
        return `conversion ${index + 1} (target ${targets[index]}) resolved`;
      }
      const reason = outcome.reason;
      const code = reason && reason.code ? reason.code : String(reason);
      const message = reason && reason.message ? reason.message : "";
      return `conversion ${index + 1} (target ${targets[index]}) rejected with ${code}: ${message}`;
    })
    .join(" | ");
}

async function newWork(label) {
  const dir = path.join(TMP_ROOT, label);
  await fs.ensureDir(dir);
  return dir;
}

async function writeWorkbook(filePath, label) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(["label", label]);
  sheet.addRow(["amount", 1]);
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

async function assertRealPdf(filePath, label) {
  assert.ok(await fs.pathExists(filePath), `${label}: output file is missing: ${filePath}`);
  const stat = await fs.stat(filePath);
  assert.ok(stat.size > 0, `${label}: output file is empty: ${filePath}`);
  const head = (await fs.readFile(filePath)).subarray(0, 5).toString("latin1");
  assert.equal(head, "%PDF-", `${label}: output is not a PDF: ${JSON.stringify(head)}`);
}

async function assertRealHtml(filePath, label) {
  assert.ok(await fs.pathExists(filePath), `${label}: output file is missing: ${filePath}`);
  const stat = await fs.stat(filePath);
  assert.ok(stat.size > 0, `${label}: output file is empty: ${filePath}`);
  const head = (await fs.readFile(filePath)).subarray(0, 512).toString("utf8").toLowerCase();
  assert.ok(
    head.includes("<html") || head.includes("<!doctype html"),
    `${label}: output is not HTML: ${JSON.stringify(head.slice(0, 80))}`
  );
}

describe("convertWithLibreOffice concurrent conversions", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });

  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  for (const repetition of REPETITIONS) {
    it(`two conversions in flight at once, to different targets, both succeed (run ${repetition} of ${REPETITIONS.length})`, { skip: UNAVAILABLE }, async () => {
      const work = await newWork(`concurrent-${repetition}`);
      const pdfInput = await writeWorkbook(path.join(work, "to-pdf.xlsx"), `to-pdf-${repetition}`);
      const htmlInput = await writeWorkbook(path.join(work, "to-html.xlsx"), `to-html-${repetition}`);
      const pdfOutput = path.join(work, "converted.pdf");
      const htmlOutput = path.join(work, "converted.html");

      // No await between these two calls: both conversions are in flight before either one
      // finishes. Nothing in this test orders them or retries them.
      const settled = await Promise.allSettled([
        convertWithLibreOffice({
          inputPath: pdfInput,
          targetFormat: "pdf",
          outputPath: pdfOutput,
          libreOfficeBin: LIBRE_BIN,
        }),
        convertWithLibreOffice({
          inputPath: htmlInput,
          targetFormat: "html",
          outputPath: htmlOutput,
          libreOfficeBin: LIBRE_BIN,
        }),
      ]);

      assert.deepEqual(
        settled.map((outcome) => outcome.status),
        ["fulfilled", "fulfilled"],
        `two concurrent conversions must both succeed, got: ${describeOutcomes(settled, ["pdf", "html"])}`
      );
      await assertRealPdf(pdfOutput, "concurrent conversion to pdf");
      await assertRealHtml(htmlOutput, "concurrent conversion to html");
    });
  }

  it(`all ${BURST} conversions started in the same tick succeed`, { skip: UNAVAILABLE }, async () => {
    const work = await newWork("burst");
    const jobs = [];
    for (let index = 0; index < BURST; index += 1) {
      const target = index % 2 === 0 ? "pdf" : "html";
      const input = await writeWorkbook(path.join(work, `burst-${index}.xlsx`), `burst-${index}`);
      jobs.push({ index, target, input, output: path.join(work, `burst-${index}.${target}`) });
    }

    // Fixtures are all on disk before this point, so every conversion below starts before
    // any of them can finish. Nothing orders them and nothing retries them.
    const settled = await Promise.allSettled(
      jobs.map((job) =>
        convertWithLibreOffice({
          inputPath: job.input,
          targetFormat: job.target,
          outputPath: job.output,
          libreOfficeBin: LIBRE_BIN,
        })
      )
    );

    assert.deepEqual(
      settled.map((outcome) => outcome.status),
      jobs.map(() => "fulfilled"),
      `all ${BURST} simultaneous conversions must succeed, got: ${describeOutcomes(settled, jobs.map((job) => job.target))}`
    );
    for (const job of jobs) {
      const label = `simultaneous conversion ${job.index} to ${job.target}`;
      if (job.target === "pdf") await assertRealPdf(job.output, label);
      else await assertRealHtml(job.output, label);
    }
  });

  it("a single conversion on its own still succeeds", { skip: UNAVAILABLE }, async () => {
    const work = await newWork("single");
    const input = await writeWorkbook(path.join(work, "single.xlsx"), "single");
    const output = path.join(work, "single.pdf");

    await convertWithLibreOffice({
      inputPath: input,
      targetFormat: "pdf",
      outputPath: output,
      libreOfficeBin: LIBRE_BIN,
    });

    await assertRealPdf(output, "single conversion to pdf");
  });
});
