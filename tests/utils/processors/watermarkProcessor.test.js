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
import { watermarkPdf } from "../../../utils/processors/watermarkProcessor.js";

const DOCS_LOCKED_ENC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../Docs/pdf/locked/enc.pdf",
);
const TMP_ROOT = path.join(os.tmpdir(), `drdocs-watermark-${Date.now()}`);

describe("watermarkProcessor", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });

  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  async function countTextInput(bytes, needle = "Confidential") {
    const doc = await getDocument({ data: new Uint8Array(bytes) }).promise;
    let matches = 0;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escaped, "g");
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => item.str).join(" ");
      matches += (text.match(pattern) || []).length;
    }
    await doc.destroy();
    return matches;
  }

  async function makeValidPdf(dir, name = "valid.pdf", pages = 1, box = [200, 200]) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage(box);
    const bytes = await doc.save();
    const p = path.join(dir, name);
    await fs.writeFile(p, bytes);
    return p;
  }

  it("stamps exactly one stamp per page when the type is absent", async () => {
    // The additive default: nothing changed for requests without a type.
    const work = path.join(TMP_ROOT, "default-type");
    await fs.ensureDir(work);
    const input = await makeValidPdf(work, "in.pdf", 1, [200, 200]);
    const out = path.join(work, "out.pdf");
    await assert.doesNotReject(() =>
      watermarkPdf({
        inputPath: input,
        outputPath: out,
        text: "Stamp",
        angle: "0",
        opacity: "1",
      }),
    );
    const bytes = await fs.readFile(out);
    assert.equal(await countTextInput(bytes, "Stamp"), 1);
  });

  it("tiled type stamps a three across grid: 12 tiles on A4 portrait", async () => {
    const work = path.join(TMP_ROOT, "mosaic-portrait");
    await fs.ensureDir(work);
    const input = await makeValidPdf(work, "in.pdf", 1, [595.28, 841.89]);
    const out = path.join(work, "out.pdf");
    await assert.doesNotReject(() =>
      watermarkPdf({
        inputPath: input,
        outputPath: out,
        text: "Confidential",
        angle: "45",
        opacity: "1",
        type: "mosaic",
      }),
    );
    const bytes = await fs.readFile(out);
    assert.equal(await countTextInput(bytes), 12);
  });

  it("tiled type keeps filling landscape pages: 6 tiles on A4 landscape", async () => {
    const work = path.join(TMP_ROOT, "mosaic-landscape");
    await fs.ensureDir(work);
    const input = await makeValidPdf(work, "in.pdf", 1, [841.89, 595.28]);
    const out = path.join(work, "out.pdf");
    await watermarkPdf({
      inputPath: input,
      outputPath: out,
      text: "Confidential",
      angle: "0",
      opacity: "1",
      type: "mosaic",
    });
    const bytes = await fs.readFile(out);
    assert.equal(await countTextInput(bytes), 6);
  });

  it("rejects an unknown watermark type", async () => {
    const work = path.join(TMP_ROOT, "bad-type");
    await fs.ensureDir(work);
    const input = await makeValidPdf(work, "in.pdf");
    const out = path.join(work, "out.pdf");
    await assert.rejects(
      () =>
        watermarkPdf({
          inputPath: input,
          outputPath: out,
          text: "Stamp",
          angle: "45",
          opacity: "0.35",
          type: "fancy",
        }),
      (err) => {
        assert.equal(err.code, "UNSUPPORTED_FILE");
        assert.equal(err.statusCode, 400);
        assert.equal(
          err.details?.reason,
          "Invalid watermark type: fancy. Supported types are standard and mosaic.",
        );
        return true;
      },
    );
  });

  it("stamps every page and keeps the page count", async () => {
    const work = path.join(TMP_ROOT, "three-pages");
    await fs.ensureDir(work);
    const input = await makeValidPdf(work, "in.pdf", 3);
    const out = path.join(work, "out.pdf");
    await assert.doesNotReject(() =>
      watermarkPdf({
        inputPath: input,
        outputPath: out,
        text: "Confidential",
        angle: "45",
        opacity: "0.35",
      }),
    );
    assert.ok(await fs.pathExists(out));
    const bytes = await fs.readFile(out);
    const loaded = await PDFDocument.load(bytes);
    assert.equal(loaded.getPageCount(), 3);
    // Text extraction is the user-visible truth: read the printed pages with
    // pdf.js (the same renderer the client preview uses) and count the stamp.
    const stampOccurrences = await countTextInput(bytes);
    assert.ok(
      stampOccurrences >= 3,
      `expected the stamp on 3 pages, found ${stampOccurrences}`,
    );
  });

  it("works flat (0 degrees) and diagonal (45 degrees)", async () => {
    const work = path.join(TMP_ROOT, "angles");
    await fs.ensureDir(work);
    const flat = await makeValidPdf(work, "flat.pdf");
    const outFlat = path.join(work, "flat_out.pdf");
    await watermarkPdf({
      inputPath: flat,
      outputPath: outFlat,
      text: "Draft copy",
      angle: "0",
      opacity: "1",
    });
    const loaded = await PDFDocument.load(await fs.readFile(outFlat));
    assert.equal(loaded.getPageCount(), 1);

    const diagonal = await makeValidPdf(work, "diag.pdf");
    const outDiag = path.join(work, "diag_out.pdf");
    await watermarkPdf({
      inputPath: diagonal,
      outputPath: outDiag,
      text: "Draft copy",
      angle: "45",
      opacity: "0.2",
    });
    assert.ok(await fs.pathExists(outDiag));
  });

  it("never touches the input file", async () => {
    const work = path.join(TMP_ROOT, "input-untouched");
    await fs.ensureDir(work);
    const input = await makeValidPdf(work, "in.pdf");
    const before = await fs.stat(input);
    const out = path.join(work, "out.pdf");
    await watermarkPdf({
      inputPath: input,
      outputPath: out,
      text: "Company name",
      angle: "45",
      opacity: "0.35",
    });
    const after = await fs.stat(input);
    assert.equal(before.size, after.size);
    assert.equal(before.mtimeMs, after.mtimeMs);
  });

  it("rejects empty text", async () => {
    const work = path.join(TMP_ROOT, "empty-text");
    await fs.ensureDir(work);
    const input = await makeValidPdf(work, "in.pdf");
    const out = path.join(work, "out.pdf");
    await assert.rejects(
      () =>
        watermarkPdf({
          inputPath: input,
          outputPath: out,
          text: "   ",
          angle: "45",
          opacity: "0.35",
        }),
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "UNSUPPORTED_FILE");
        assert.equal(err.statusCode, 400);
        assert.equal(err.details?.reason, "Enter text to watermark the PDF.");
        return true;
      },
    );
  });

  it("rejects text over the 120 character limit", async () => {
    const work = path.join(TMP_ROOT, "long-text");
    await fs.ensureDir(work);
    const input = await makeValidPdf(work, "in.pdf");
    const out = path.join(work, "out.pdf");
    await assert.rejects(
      () =>
        watermarkPdf({
          inputPath: input,
          outputPath: out,
          text: "a".repeat(121),
          angle: "45",
          opacity: "0.35",
        }),
      (err) => {
        assert.equal(err.code, "UNSUPPORTED_FILE");
        assert.ok(/limit/.test(err.details?.reason || ""));
        return true;
      },
    );
  });

  it("rejects text outside the Latin-1 print range", async () => {
    const work = path.join(TMP_ROOT, "non-latin");
    await fs.ensureDir(work);
    const input = await makeValidPdf(work, "in.pdf");
    const out = path.join(work, "out.pdf");
    await assert.rejects(
      () =>
        watermarkPdf({
          inputPath: input,
          outputPath: out,
          text: "Se\xf1or \u2026 mark",
          angle: "45",
          opacity: "0.35",
        }),
      (err) => {
        assert.equal(err.code, "UNSUPPORTED_FILE");
        assert.equal(
          err.details?.reason,
          "Watermark text supports standard letters, numbers, and punctuation.",
        );
        return true;
      },
    );
  });

  it("rejects an angle other than 0 or 45", async () => {
    const work = path.join(TMP_ROOT, "bad-angle");
    await fs.ensureDir(work);
    const input = await makeValidPdf(work, "in.pdf");
    const out = path.join(work, "out.pdf");
    await assert.rejects(
      () =>
        watermarkPdf({
          inputPath: input,
          outputPath: out,
          text: "Stamp",
          angle: "33",
          opacity: "0.35",
        }),
      (err) => {
        assert.equal(err.code, "UNSUPPORTED_FILE");
        assert.equal(
          err.details?.reason,
          "Invalid watermark angle: 33. Supported angles are 0 and 45.",
        );
        return true;
      },
    );
  });

  it("rejects opacity outside (0, 1]", async () => {
    const work = path.join(TMP_ROOT, "bad-opacity");
    await fs.ensureDir(work);
    const input = await makeValidPdf(work, "in.pdf");
    const out = path.join(work, "out.pdf");
    await assert.rejects(
      () =>
        watermarkPdf({
          inputPath: input,
          outputPath: out,
          text: "Stamp",
          angle: "45",
          opacity: "1.5",
        }),
      (err) => {
        assert.equal(err.code, "UNSUPPORTED_FILE");
        assert.equal(
          err.details?.reason,
          "Invalid watermark opacity: 1.5. Use a number between 0 and 1.",
        );
        return true;
      },
    );
  });

  it("throws PASSWORD_REQUIRED for an encrypted PDF fixture", async () => {
    if (await fs.pathExists(DOCS_LOCKED_ENC)) {
      const out = path.join(TMP_ROOT, "enc_out.pdf");
      await assert.rejects(
        () =>
          watermarkPdf({
            inputPath: DOCS_LOCKED_ENC,
            outputPath: out,
            text: "Confidential",
            angle: "45",
            opacity: "0.35",
          }),
        (err) => {
          assert.ok(err instanceof AppError);
          assert.equal(err.code, "PASSWORD_REQUIRED");
          assert.equal(err.message, SECURE_ENCRYPTION_MESSAGE);
          assert.equal(err.statusCode, 400);
          return true;
        },
      );
    } else {
      // Without the locked fixture there is nothing real to refuse; check the
      // garbage file fails as corrupted instead, never as a success.
      const bad = path.join(TMP_ROOT, "fake_enc.pdf");
      await fs.writeFile(bad, Buffer.from("%PDF-1.4 truncated"));
      const out = path.join(TMP_ROOT, "fake_out.pdf");
      await assert.rejects(
        () =>
          watermarkPdf({
            inputPath: bad,
            outputPath: out,
            text: "Confidential",
            angle: "45",
            opacity: "0.35",
          }),
        (err) => err.code === "FILE_CORRUPTED",
      );
    }
  });

  it("throws FILE_CORRUPTED for a corrupt PDF", async () => {
    const work = path.join(TMP_ROOT, "corrupt");
    await fs.ensureDir(work);
    const valid = await makeValidPdf(work, "valid.pdf");
    const buf = await fs.readFile(valid);
    const bad = path.join(work, "bad.pdf");
    await fs.writeFile(bad, buf.subarray(0, 20));
    const out = path.join(work, "out.pdf");
    await assert.rejects(
      () =>
        watermarkPdf({
          inputPath: bad,
          outputPath: out,
          text: "Confidential",
          angle: "45",
          opacity: "0.35",
        }),
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "FILE_CORRUPTED");
        assert.equal(err.statusCode, 400);
        return true;
      },
    );
  });
});
