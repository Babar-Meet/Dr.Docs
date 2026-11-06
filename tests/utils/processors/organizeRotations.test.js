// Pins organize rotations, which are positions in the OUTPUT order, not source
// page numbers. Tier: Critical, because the rotation must follow the tile
// through reorder, delete and duplicate, and a wrong map silently rotates the
// wrong page.
//
// Frozen contract (Temp/FIX_SPEC.md):
//   parseOrganizeRotations(rotationsRaw, outputPageCount) -> { [outputIndex]: angle }
//   {} for absent/empty, AppError UNSUPPORTED_FILE 400 for anything else.
//   Absent rotations produce exactly the output organize produced before.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { AppError } from "../../../utils/errors.js";
import {
  organizePdf,
  parseOrganizeRotations,
} from "../../../utils/processors/organizeProcessor.js";

const TMP_ROOT = path.join(os.tmpdir(), `drdocs-organize-rot-${process.pid}-${Date.now()}`);

function normalizedAngle(page) {
  return ((page.getRotation().angle % 360) + 360) % 360;
}

function assertUnsupported(fn, label) {
  return assert.rejects(fn, (err) => {
    assert.ok(err instanceof AppError, `${label}: expected AppError, got ${err?.constructor?.name}`);
    assert.equal(err.code, "UNSUPPORTED_FILE", `${label}: wrong code`);
    assert.equal(err.statusCode, 400, `${label}: wrong status code`);
    return true;
  });
}

describe("organizeProcessor rotations", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });

  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  async function makeTestPdf(dir, name = "sample.pdf") {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    // Page sizes are distinct so the output order is readable without text
    // extraction: page 1 is 200x200, page 2 is 300x300, page 3 is 400x400.
    const sizes = [
      [200, 200],
      [300, 300],
      [400, 400],
    ];
    sizes.forEach(([width, height], index) => {
      const page = doc.addPage([width, height]);
      page.drawText(`Page ${index + 1}`, { x: 20, y: 100, size: 20, font });
    });
    const filePath = path.join(dir, name);
    await fs.writeFile(filePath, await doc.save());
    return filePath;
  }

  async function loadOutput(filePath) {
    assert.ok(await fs.pathExists(filePath), `output missing: ${filePath}`);
    return PDFDocument.load(await fs.readFile(filePath));
  }

  describe("parseOrganizeRotations", () => {
    it("returns an empty object for absent or empty rotations", () => {
      for (const empty of [undefined, null, "", "   "]) {
        assert.deepEqual(parseOrganizeRotations(empty, 3), {}, JSON.stringify(empty));
      }
    });

    it("returns a zero-based map of output position to angle", () => {
      assert.deepEqual(parseOrganizeRotations("1:90", 3), { 0: 90 });
      assert.deepEqual(parseOrganizeRotations("1:90,3:180", 3), { 0: 90, 2: 180 });
      assert.deepEqual(parseOrganizeRotations("2:270", 2), { 1: 270 });
    });

    it("rejects malformed tokens instead of silently ignoring them", () => {
      for (const bad of ["one:90", "1", "1:90:180", "1:abc"]) {
        assert.throws(
          () => parseOrganizeRotations(bad, 3),
          (err) => {
            assert.ok(err instanceof AppError, `${bad}: expected AppError`);
            assert.equal(err.code, "UNSUPPORTED_FILE", `${bad}: wrong code`);
            assert.equal(err.statusCode, 400, `${bad}: wrong status code`);
            return true;
          },
          bad,
        );
      }
    });

    it("rejects positions outside the output page count", () => {
      assert.throws(() => parseOrganizeRotations("4:90", 3), (err) => err.code === "UNSUPPORTED_FILE");
      assert.throws(() => parseOrganizeRotations("0:90", 3), (err) => err.code === "UNSUPPORTED_FILE");
    });

    it("rejects angles outside 90, 180 and 270", () => {
      for (const bad of ["1:45", "1:0", "1:360"]) {
        assert.throws(() => parseOrganizeRotations(bad, 3), (err) => err.code === "UNSUPPORTED_FILE", bad);
      }
    });

    it("rejects a duplicate output position", () => {
      assert.throws(
        () => parseOrganizeRotations("1:90,1:180", 3),
        (err) => err.code === "UNSUPPORTED_FILE",
      );
    });
  });

  describe("organizePdf applies rotations to output positions", () => {
    it("rotates the output page named by position 1, not source page 1", async () => {
      const work = path.join(TMP_ROOT, "run-first-output");
      await fs.ensureDir(work);
      const input = await makeTestPdf(work);
      const output = path.join(work, "output.pdf");

      // organizePages 3,1 puts source page 3 first in the output.
      await organizePdf({
        inputPath: input,
        outputPath: output,
        organizePages: "3,1",
        rotations: "1:90",
      });

      const outputDoc = await loadOutput(output);
      assert.equal(outputDoc.getPageCount(), 2);
      assert.deepEqual(outputDoc.getPages().map((page) => page.getWidth()), [400, 200]);
      assert.equal(normalizedAngle(outputDoc.getPage(0)), 90, "output position 1 must be rotated");
      assert.equal(normalizedAngle(outputDoc.getPage(1)), 0, "output position 2 must stay untouched");
    });

    it("rotates output position 2 while position 1 stays untouched", async () => {
      const work = path.join(TMP_ROOT, "run-second-output");
      await fs.ensureDir(work);
      const input = await makeTestPdf(work);
      const output = path.join(work, "output.pdf");

      await organizePdf({
        inputPath: input,
        outputPath: output,
        organizePages: "2,1",
        rotations: "2:270",
      });

      const outputDoc = await loadOutput(output);
      assert.deepEqual(outputDoc.getPages().map((page) => page.getWidth()), [300, 200]);
      assert.equal(normalizedAngle(outputDoc.getPage(0)), 0);
      assert.equal(normalizedAngle(outputDoc.getPage(1)), 270);
    });

    it("applies a different angle to each output position", async () => {
      const work = path.join(TMP_ROOT, "run-mixed");
      await fs.ensureDir(work);
      const input = await makeTestPdf(work);
      const output = path.join(work, "output.pdf");

      await organizePdf({
        inputPath: input,
        outputPath: output,
        organizePages: "3,1,2",
        rotations: "1:90,2:180,3:270",
      });

      const outputDoc = await loadOutput(output);
      assert.deepEqual(outputDoc.getPages().map(normalizedAngle), [90, 180, 270]);
    });

    it("a delete does not shift the declared rotation onto another output page", async () => {
      const work = path.join(TMP_ROOT, "run-delete");
      await fs.ensureDir(work);
      const input = await makeTestPdf(work);
      const output = path.join(work, "output.pdf");

      // Source page 2 is deleted; output positions are source 3 then source 1.
      await organizePdf({
        inputPath: input,
        outputPath: output,
        organizePages: "3,1",
        rotations: "2:180",
      });

      const outputDoc = await loadOutput(output);
      assert.deepEqual(outputDoc.getPages().map((page) => page.getWidth()), [400, 200]);
      assert.equal(normalizedAngle(outputDoc.getPage(0)), 0);
      assert.equal(normalizedAngle(outputDoc.getPage(1)), 180);
    });

    it("a duplicate at a rotated position is allowed and both copies stay separate", async () => {
      const work = path.join(TMP_ROOT, "run-duplicate");
      await fs.ensureDir(work);
      const input = await makeTestPdf(work);
      const output = path.join(work, "output.pdf");

      await organizePdf({
        inputPath: input,
        outputPath: output,
        organizePages: "1,1,2",
        rotations: "2:90",
      });

      const outputDoc = await loadOutput(output);
      assert.deepEqual(outputDoc.getPages().map((page) => page.getWidth()), [200, 200, 300]);
      assert.deepEqual(outputDoc.getPages().map(normalizedAngle), [0, 90, 0]);
    });

    it("without rotations the output keeps the original 0 degree rotation", async () => {
      const work = path.join(TMP_ROOT, "run-norot");
      await fs.ensureDir(work);
      const input = await makeTestPdf(work);
      const output = path.join(work, "output.pdf");

      await organizePdf({
        inputPath: input,
        outputPath: output,
        organizePages: "2,1",
      });

      const outputDoc = await loadOutput(output);
      assert.equal(outputDoc.getPageCount(), 2);
      assert.deepEqual(outputDoc.getPages().map(normalizedAngle), [0, 0]);
    });

    it("an empty rotations field behaves exactly like an absent one", async () => {
      const work = path.join(TMP_ROOT, "run-empty");
      await fs.ensureDir(work);
      const input = await makeTestPdf(work);
      const output = path.join(work, "output.pdf");

      await organizePdf({
        inputPath: input,
        outputPath: output,
        organizePages: "2,1",
        rotations: "",
      });

      const outputDoc = await loadOutput(output);
      assert.deepEqual(outputDoc.getPages().map(normalizedAngle), [0, 0]);
    });
  });

  describe("organizePdf rejects rotations it cannot apply", () => {
    const badCases = [
      ["a position past the output page count", "3:90", "1,2"],
      ["position 0", "0:90", "1,2"],
      ["an unsupported angle", "1:45", "1,2"],
      ["a malformed token", "one:90", "1,2"],
      ["a duplicate position", "1:90,1:180", "1,2"],
    ];

    for (const [label, rotations, organizePages] of badCases) {
      it(`rejects ${label} with UNSUPPORTED_FILE 400 before writing output`, async () => {
        const work = path.join(TMP_ROOT, `reject-${label.replace(/[^a-z0-9]+/gi, "-")}`);
        await fs.ensureDir(work);
        const input = await makeTestPdf(work);
        const output = path.join(work, "output.pdf");

        await assertUnsupported(
          () => organizePdf({ inputPath: input, outputPath: output, organizePages, rotations }),
          label,
        );
        assert.equal(await fs.pathExists(output), false, "a rejected organize must not leave an output");
      });
    }

    it("counts output pages, not source pages, when an angle is out of range", async () => {
      const work = path.join(TMP_ROOT, "reject-output-count");
      await fs.ensureDir(work);
      const input = await makeTestPdf(work);
      const output = path.join(work, "output.pdf");

      // The source has 3 pages, but this arrangement keeps only 2 output
      // pages, so output position 3 does not exist.
      await assertUnsupported(
        () => organizePdf({ inputPath: input, outputPath: output, organizePages: "1,2", rotations: "3:90" }),
        "output position past output count",
      );
    });
  });
});
