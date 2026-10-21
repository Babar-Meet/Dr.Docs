import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { AppError } from "../../../utils/errors.js";
import { SECURE_ENCRYPTION_MESSAGE } from "../../../utils/constants.js";
import {
  organizePdf,
  parseOrganizeOrder,
} from "../../../utils/processors/organizeProcessor.js";

const DOCS_LOCKED_ENC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../Docs/pdf/locked/enc.pdf",
);
const TMP_ROOT = path.join(os.tmpdir(), `drdocs-organize-${Date.now()}`);
const CONDITION = "Choose how to arrange the pages before organizing.";

function invalidReason(token, pageCount) {
  return `Invalid page: ${token}. Use page numbers between 1 and ${pageCount}.`;
}

function capReason(maxEntries) {
  return `Use at most ${maxEntries} page entries.`;
}

describe("organizeProcessor", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });

  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  // Real 3-page fixture: every page carries exactly one readable label, so
  // the output order is provable by text extraction alone.
  async function makeTextPdf(dir, name = "in.pdf") {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const text of ["P one", "P two", "P three"]) {
      const page = doc.addPage([200, 200]);
      page.drawText(text, { x: 20, y: 100, size: 24, font });
    }
    const p = path.join(dir, name);
    await fs.writeFile(p, await doc.save());
    return p;
  }

  async function pageTexts(bytes) {
    const doc = await getDocument({ data: new Uint8Array(bytes) }).promise;
    const texts = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      texts.push(content.items.map((item) => item.str).join(" ").trim());
    }
    await doc.destroy();
    return texts;
  }

  async function runOrganize(caseName, organizePages) {
    const work = path.join(TMP_ROOT, caseName);
    await fs.ensureDir(work);
    const input = await makeTextPdf(work);
    const out = path.join(work, "out.pdf");
    await organizePdf({ inputPath: input, outputPath: out, organizePages });
    assert.ok(await fs.pathExists(out));
    return pageTexts(await fs.readFile(out));
  }

  it("reorder 3,1,2 puts old page 3 first in the output", async () => {
    assert.deepEqual(await runOrganize("reorder", "3,1,2"), [
      "P three",
      "P one",
      "P two",
    ]);
  });

  it("delete 1,3 keeps exactly the remaining pages in order", async () => {
    const texts = await runOrganize("delete", "1,3");
    assert.equal(texts.length, 2);
    assert.deepEqual(texts, ["P one", "P three"]);
  });

  it("duplicate 1,1 keeps page 1 twice", async () => {
    const texts = await runOrganize("duplicate", "1,1");
    assert.equal(texts.length, 2);
    assert.deepEqual(texts, ["P one", "P one"]);
  });

  it("a 2 page source takes the full 200 entry floor into a 200 page output", async () => {
    // Same shape as makeTextPdf, kept at exactly 2 pages so the 200 entry
    // floor (not the twice-page-count rule) is the one that binds here.
    const work = path.join(TMP_ROOT, "floor-200");
    await fs.ensureDir(work);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const text of ["P one", "P two"]) {
      const page = doc.addPage([200, 200]);
      page.drawText(text, { x: 20, y: 100, size: 24, font });
    }
    const input = path.join(work, "in.pdf");
    await fs.writeFile(input, await doc.save());
    const order = Array.from({ length: 200 }, (_, index) => (index % 2 === 0 ? 1 : 2));
    const out = path.join(work, "out.pdf");
    await organizePdf({
      inputPath: input,
      outputPath: out,
      organizePages: order.join(","),
    });
    assert.ok(await fs.pathExists(out));
    const output = await PDFDocument.load(await fs.readFile(out));
    assert.equal(output.getPageCount(), 200);
  });

  it("identity 1,2,3 keeps every page in order", async () => {
    assert.deepEqual(await runOrganize("identity", "1,2,3"), [
      "P one",
      "P two",
      "P three",
    ]);
  });

  it("never touches the input file", async () => {
    const work = path.join(TMP_ROOT, "untouched");
    await fs.ensureDir(work);
    const input = await makeTextPdf(work);
    const before = await fs.stat(input);
    await organizePdf({
      inputPath: input,
      outputPath: path.join(work, "out.pdf"),
      organizePages: "1",
    });
    const after = await fs.stat(input);
    assert.equal(before.size, after.size);
    assert.equal(before.mtimeMs, after.mtimeMs);
  });

  it("rejects an empty arrangement with the frozen reason", async () => {
    const work = path.join(TMP_ROOT, "empty-order");
    await fs.ensureDir(work);
    const input = await makeTextPdf(work);
    for (const organizePages of [undefined, "", "   ", " , "]) {
      await assert.rejects(
        () =>
          organizePdf({
            inputPath: input,
            outputPath: path.join(work, "out.pdf"),
            organizePages,
          }),
        (err) => {
          assert.ok(err instanceof AppError);
          assert.equal(err.code, "UNSUPPORTED_FILE");
          assert.equal(err.statusCode, 400);
          assert.equal(err.details.reason, CONDITION);
          return true;
        },
      );
    }
  });

  it("rejects junk tokens with the frozen per-token reason", async () => {
    const work = path.join(TMP_ROOT, "junk-order");
    await fs.ensureDir(work);
    const input = await makeTextPdf(work);
    for (const [organizePages, badToken] of [
      ["abc", "abc"],
      ["0", "0"],
      ["99", "99"],
      ["3abc", "3abc"],
      ["1,0", "0"],
      ["1,2,99", "99"],
    ]) {
      await assert.rejects(
        () =>
          organizePdf({
            inputPath: input,
            outputPath: path.join(work, "out.pdf"),
            organizePages,
          }),
        (err) => {
          assert.ok(err instanceof AppError);
          assert.equal(err.code, "UNSUPPORTED_FILE");
          assert.equal(err.statusCode, 400);
          assert.equal(err.details.reason, invalidReason(badToken, 3));
          return true;
        },
      );
    }
  });

  it("throws PASSWORD_REQUIRED with SECURE_ENCRYPTION_MESSAGE for an encrypted PDF", async () => {
    if (await fs.pathExists(DOCS_LOCKED_ENC)) {
      const out = path.join(TMP_ROOT, "enc_out.pdf");
      await assert.rejects(
        () =>
          organizePdf({
            inputPath: DOCS_LOCKED_ENC,
            outputPath: out,
            organizePages: "1,2",
          }),
        (err) => {
          assert.ok(err instanceof AppError);
          assert.equal(err.code, "PASSWORD_REQUIRED");
          assert.equal(err.message, SECURE_ENCRYPTION_MESSAGE);
          assert.equal(err.statusCode, 400);
          return true;
        },
      );
    }
  });

  it("throws FILE_CORRUPTED for garbage bytes", async () => {
    const work = path.join(TMP_ROOT, "corrupt");
    await fs.ensureDir(work);
    const input = await makeTextPdf(work);
    const buf = await fs.readFile(input);
    const bad = path.join(work, "bad.pdf");
    await fs.writeFile(bad, buf.subarray(0, 20));
    await assert.rejects(
      () =>
        organizePdf({
          inputPath: bad,
          outputPath: path.join(work, "out.pdf"),
          organizePages: "1",
        }),
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "FILE_CORRUPTED");
        assert.equal(err.statusCode, 400);
        return true;
      },
    );
  });

  it("parseOrganizeOrder agrees with the successful organize runs", async () => {
    assert.deepEqual(parseOrganizeOrder("3,1,2", 3), [3, 1, 2]);
    assert.deepEqual(parseOrganizeOrder("1,3", 3), [1, 3]);
    assert.deepEqual(parseOrganizeOrder("1,1", 3), [1, 1]);
    assert.deepEqual(parseOrganizeOrder(" 2 , 1 ", 3), [2, 1]);
    assert.throws(
      () => parseOrganizeOrder("", 3),
      (err) =>
        err.code === "UNSUPPORTED_FILE" && err.details.reason === CONDITION,
    );
    assert.throws(
      () => parseOrganizeOrder("4", 3),
      (err) => err.details.reason === invalidReason("4", 3),
    );
  });

  it("parseOrganizeOrder caps the entries at twice the page count", async () => {
    // A 300 page source means cap 600: 300 alternating entries parse and
    // 601 refuse by length before any per-token check runs.
    const inCap = Array.from({ length: 300 }, (_, index) => (index % 2 === 0 ? 5 : 7));
    assert.deepEqual(parseOrganizeOrder(inCap.join(","), 300), inCap);
    const pastCap = Array.from({ length: 601 }, (_, index) => (index % 2 === 0 ? 5 : 7));
    assert.throws(
      () => parseOrganizeOrder(pastCap.join(","), 300),
      (err) =>
        err instanceof AppError &&
        err.code === "UNSUPPORTED_FILE" &&
        err.statusCode === 400 &&
        err.details.reason === capReason(600),
    );
  });

  it("parseOrganizeOrder keeps the 200 entry floor on small sources", async () => {
    // A 2 page source caps at 200, not at 4: 200 alternating entries parse
    // and 201 refuse by length.
    const inCap = Array.from({ length: 200 }, (_, index) => (index % 2 === 0 ? 1 : 2));
    assert.deepEqual(parseOrganizeOrder(inCap.join(","), 2), inCap);
    const pastCap = inCap.concat(1);
    assert.throws(
      () => parseOrganizeOrder(pastCap.join(","), 2),
      (err) =>
        err instanceof AppError &&
        err.code === "UNSUPPORTED_FILE" &&
        err.statusCode === 400 &&
        err.details.reason === capReason(200),
    );
  });
});
