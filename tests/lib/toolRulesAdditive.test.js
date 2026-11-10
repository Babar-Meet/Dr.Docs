// Additive client request tests for the two new optional wire fields.
// Tier: Critical for the organize rotation field (a lost field means the user's
// rotation never reaches the server) and for the compress level (a lost field
// means the file is silently compressed at the default level).
//
// Nothing here replaces or weakens tests/lib/toolRules.test.js; that file keeps
// pinning the pre-existing behaviour, including compress appending no fields
// when no level is selected.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  appendOptionFields,
  buildRequestOptionValues,
} from "../../client/src/lib/toolRules.js";

function formData() {
  return new FormData();
}

describe("additive toolRules: compressionLevel", () => {
  for (const level of ["recommended", "extreme", "low"]) {
    it(`compress "${level}" sends the field`, () => {
      const values = buildRequestOptionValues({
        operation: "compress",
        state: { compressionLevel: level },
      });
      assert.equal(values.compressionLevel, level);

      const form = formData();
      appendOptionFields(form, { operation: "compress", values });
      assert.equal(form.get("compressionLevel"), level);
      assert.deepEqual([...form.keys()], ["compressionLevel"], "compress must send no other option field");
    });
  }

  for (const state of [{ compressionLevel: "lossless" }, {}]) {
    it(`compress ${JSON.stringify(state)} sends no level field`, () => {
      const values = buildRequestOptionValues({ operation: "compress", state });
      assert.equal(values.compressionLevel, undefined);

      const form = formData();
      appendOptionFields(form, { operation: "compress", values });
      assert.equal(form.get("compressionLevel"), null);
      assert.equal([...form.keys()].length, 0);
    });
  }
});

describe("additive toolRules: organize rotations", () => {
  it("organize sends organizePages and rotations together", () => {
    const values = buildRequestOptionValues({
      operation: "organize",
      state: { organizeOrder: "2,1", organizeRotations: "1:90" },
    });
    assert.equal(values.organizePages, "2,1");
    assert.equal(values.rotations, "1:90");

    const form = formData();
    appendOptionFields(form, { operation: "organize", values });
    assert.equal(form.get("organizePages"), "2,1");
    assert.equal(form.get("rotations"), "1:90");
    const names = [...form.keys()];
    assert.equal(names.length, 2);
    assert.deepEqual(names.sort(), ["organizePages", "rotations"]);
  });

  it("organize without rotations keeps sending only organizePages", () => {
    const values = buildRequestOptionValues({
      operation: "organize",
      state: { organizeOrder: "2,1" },
    });
    assert.equal(values.organizePages, "2,1");
    assert.equal(values.rotations, "");

    const form = formData();
    appendOptionFields(form, { operation: "organize", values });
    assert.equal(form.get("organizePages"), "2,1");
    assert.equal(form.get("rotations"), null, "an empty rotations field must be omitted");
    assert.deepEqual([...form.keys()], ["organizePages"]);
  });

  it("organize trims the order but forwards the rotation declaration verbatim", () => {
    const values = buildRequestOptionValues({
      operation: "organize",
      state: { organizeOrder: " 2,1 ", organizeRotations: "1:90,2:270" },
    });
    assert.equal(values.organizePages, "2,1");
    assert.equal(values.rotations, "1:90,2:270");
  });
});
