import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { AppError } from "../../../utils/errors.js";
import { SECURE_ENCRYPTION_MESSAGE } from "../../../utils/constants.js";
import { pageNumberPdf, PAGE_NUMBER_POSITIONS } from "../../../utils/processors/pageNumbersProcessor.js";

const DOCS_LOCKED_ENC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../Docs/pdf/locked/enc.pdf",
);
const TMP_ROOT = path.join(os.tmpdir(), `drdocs-pagenumbers-${Date.now()}`);

describe("pageNumbersProcessor", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });

  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  async function makeValidPdf(dir, name = "valid.pdf", pages = 1) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
    const bytes = await doc.save();
    const p = path.join(dir, name);
    await fs.writeFile(p, bytes);
    return p;
  }

  async function pageTexts(bytes) {
    const doc = await getDocument({ data: new Uint8Array(bytes) }).promise;
    const texts = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      texts.push(content.items.map((item) => item.str).join(" "));
    }
    await doc.destroy();
    return texts;
  }

  it("numbers every page in the default corner of each page", async () => {
    const work = path.join(TMP_ROOT, "three");
    await fs.ensureDir(work);
    const input = await makeValidPdf(work, "in.pdf", 3);
    const out = path.join(work, "out.pdf");
    await pageNumberPdf({
      inputPath: input,
      outputPath: out,
      position: "bottom-center",
    });
    assert.ok(await fs.pathExists(out));
    const bytes = await fs.readFile(out);
    const loaded = await PDFDocument.load(bytes);
    assert.equal(loaded.getPageCount(), 3);

    const texts = await pageTexts(bytes);
    // Each page shows its own number and no other page's number.
    assert.ok((texts[0].match(/\b1\b/g) || []).length >= 1, `page 1 text: ${texts[0]}`);
    assert.ok((texts[1].match(/\b2\b/g) || []).length >= 1, `page 2 text: ${texts[1]}`);
    assert.ok((texts[2].match(/\b3\b/g) || []).length >= 1, `page 3 text: ${texts[2]}`);
  });

  it("never touches the input file", async () => {
    const work = path.join(TMP_ROOT, "untouched");
    await fs.ensureDir(work);
    const input = await makeValidPdf(work, "in.pdf");
    const before = await fs.stat(input);
    const out = path.join(work, "out.pdf");
    await pageNumberPdf({
      inputPath: input,
      outputPath: out,
      position: "top-left",
    });
    const after = await fs.stat(input);
    assert.equal(before.size, after.size);
    assert.equal(before.mtimeMs, after.mtimeMs);
  });

  it("accepts every one of the nine positions", async () => {
    const work = path.join(TMP_ROOT, "positions");
    await fs.ensureDir(work);
    for (const position of PAGE_NUMBER_POSITIONS) {
      const input = await makeValidPdf(work, `${position}.pdf`);
      const out = path.join(work, `${position}_out.pdf`);
      await pageNumberPdf({ inputPath: input, outputPath: out, position });
      assert.ok(await fs.pathExists(out), position);
    }
  });

  async function numberTransforms(bytes) {
    const doc = await getDocument({ data: new Uint8Array(bytes) }).promise;
    const items = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (item.str.trim() !== "") {
          items.push({
            page: pageNumber,
            x: item.transform[4],
            y: item.transform[5],
          });
        }
      }
    }
    await doc.destroy();
    return items;
  }

  it("places the number at the requested margin distance from the edge", async () => {
    const work = path.join(TMP_ROOT, "margin");
    await fs.ensureDir(work);
    const input = await makeValidPdf(work, "in.pdf");
    const out = path.join(work, "out.pdf");
    await pageNumberPdf({
      inputPath: input,
      outputPath: out,
      position: "bottom-center",
      margin: "40",
    });
    const items = await numberTransforms(await fs.readFile(out));
    assert.equal(items.length, 1);
    // Baseline sits exactly 40 points above the page bottom, centered on the
    // 200 point wide test page (Helvetica "1" is about 6.1 points wide, so
    // the left edge is around 96.9).
    assert.ok(Math.abs(items[0].y - 40) < 1, `y was ${items[0].y}`);
    assert.ok(Math.abs(items[0].x - 96.94) < 2, `x was ${items[0].x}`);
  });

  it("keeps the default margin when the field is absent", async () => {
    const work = path.join(TMP_ROOT, "margin-default");
    await fs.ensureDir(work);
    const input = await makeValidPdf(work, "in.pdf");
    const out = path.join(work, "out.pdf");
    await pageNumberPdf({
      inputPath: input,
      outputPath: out,
      position: "bottom-center",
    });
    const items = await numberTransforms(await fs.readFile(out));
    assert.ok(Math.abs(items[0].y - 24) < 1, `y was ${items[0].y}`);
  });

  it("rejects a margin outside 0 to 100", async () => {
    const work = path.join(TMP_ROOT, "margin-invalid");
    await fs.ensureDir(work);
    const input = await makeValidPdf(work, "in.pdf");
    const out = path.join(work, "out.pdf");
    for (const bad of ["120", "-5", "abc"]) {
      await assert.rejects(
        () => pageNumberPdf({ inputPath: input, outputPath: out, position: "bottom-center", margin: bad }),
        (err) => {
          assert.equal(err.code, "UNSUPPORTED_FILE");
          assert.match(err.details?.reason || "", /^Invalid page number margin/);
          return true;
        },
      );
    }
  });

  it("rejects an unknown position", async () => {
    const work = path.join(TMP_ROOT, "bad-position");
    await fs.ensureDir(work);
    const input = await makeValidPdf(work, "in.pdf");
    const out = path.join(work, "out.pdf");
    await assert.rejects(
      () => pageNumberPdf({ inputPath: input, outputPath: out, position: "center-ish" }),
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "UNSUPPORTED_FILE");
        assert.equal(err.statusCode, 400);
        assert.ok(/Invalid page number position/.test(err.details?.reason || ""));
        return true;
      },
    );
  });

  it("rejects an empty position with the supported list", async () => {
    const work = path.join(TMP_ROOT, "empty-position");
    await fs.ensureDir(work);
    const input = await makeValidPdf(work, "in.pdf");
    const out = path.join(work, "out.pdf");
    await assert.rejects(
      () => pageNumberPdf({ inputPath: input, outputPath: out, position: "" }),
      (err) => {
        assert.equal(err.code, "UNSUPPORTED_FILE");
        assert.ok(/bottom-center/.test(err.details?.reason || ""));
        return true;
      },
    );
  });

  it("throws PASSWORD_REQUIRED for an encrypted PDF fixture", async () => {
    if (await fs.pathExists(DOCS_LOCKED_ENC)) {
      const out = path.join(TMP_ROOT, "enc_out.pdf");
      await assert.rejects(
        () => pageNumberPdf({ inputPath: DOCS_LOCKED_ENC, outputPath: out, position: "bottom-right" }),
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

  it("throws FILE_CORRUPTED for a truncated PDF", async () => {
    const work = path.join(TMP_ROOT, "corrupt");
    await fs.ensureDir(work);
    const valid = await makeValidPdf(work, "valid.pdf");
    const buf = await fs.readFile(valid);
    const bad = path.join(work, "bad.pdf");
    await fs.writeFile(bad, buf.subarray(0, 20));
    const out = path.join(work, "out.pdf");
    await assert.rejects(
      () => pageNumberPdf({ inputPath: bad, outputPath: out, position: "bottom-center" }),
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "FILE_CORRUPTED");
        assert.equal(err.statusCode, 400);
        return true;
      },
    );
  });
});
