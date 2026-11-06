// Pins the shared per-page rotation parser named by the fix spec:
//   parsePageRotations(rotationsRaw, pageCount) in utils/helpers/pageRotations.js
//   returns Map<number, number> | null (null means "no rotations")
//   and throws AppError UNSUPPORTED_FILE 400 for anything it cannot apply.
//
// Positions are 1-based output positions, angles are exactly 90, 180 and 270.
// The same helper is reused by rotateProcessor and organizeProcessor, so a
// regression here changes both tools. Tier: Critical, because a silent
// misparse would rotate the wrong page or ignore a user's request.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePageRotations } from "../../../utils/helpers/pageRotations.js";
import { AppError } from "../../../utils/errors.js";

function assertUnsupported(rotationsRaw, pageCount, label) {
  assert.throws(
    () => parsePageRotations(rotationsRaw, pageCount),
    (err) => {
      assert.ok(err instanceof AppError, `${label}: expected AppError, got ${err?.constructor?.name}`);
      assert.equal(err.code, "UNSUPPORTED_FILE", `${label}: wrong error code`);
      assert.equal(err.statusCode, 400, `${label}: wrong status code`);
      return true;
    },
    label,
  );
}

describe("parsePageRotations", () => {
  it("returns null when rotations are absent or empty", () => {
    for (const empty of [undefined, null, "", "   "]) {
      assert.equal(parsePageRotations(empty, 3), null, `expected null for ${JSON.stringify(empty)}`);
    }
  });

  it("parses one token into a 1-based Map", () => {
    const parsed = parsePageRotations("1:90", 3);
    assert.ok(parsed instanceof Map, "the helper must return a Map");
    assert.deepEqual([...parsed.entries()], [[1, 90]]);
  });

  it("parses several tokens with 1-based output positions", () => {
    const parsed = parsePageRotations("1:90,3:180", 3);
    assert.ok(parsed instanceof Map);
    assert.deepEqual([...parsed.entries()], [[1, 90], [3, 180]]);
  });

  it("accepts every supported angle", () => {
    const parsed = parsePageRotations("1:90,2:180,3:270", 3);
    assert.deepEqual([...parsed.entries()], [[1, 90], [2, 180], [3, 270]]);
  });

  it("accepts the last valid position", () => {
    const parsed = parsePageRotations("1:270", 1);
    assert.deepEqual([...parsed.entries()], [[1, 270]]);
  });

  it("rejects malformed tokens instead of ignoring them", () => {
    for (const bad of ["one:90", "1", "1:90:180", "1:abc", ":90", "1:"]) {
      assertUnsupported(bad, 3, `malformed ${JSON.stringify(bad)}`);
    }
  });

  it("rejects position 0 and positions past the page count", () => {
    assertUnsupported("0:90", 3, "position 0 is not 1-based");
    assertUnsupported("4:90", 3, "position 4 is past a 3 page count");
    assertUnsupported("1:90,4:270", 3, "the second token is past the page count");
  });

  it("rejects angles outside 90, 180 and 270", () => {
    for (const bad of ["1:45", "1:0", "1:360", "1:-90"]) {
      assertUnsupported(bad, 3, `unsupported angle ${JSON.stringify(bad)}`);
    }
  });

  it("rejects a position listed twice", () => {
    assertUnsupported("1:90,1:180", 3, "duplicate position");
    assertUnsupported("2:90,1:180,2:270", 3, "duplicate position with another token between");
  });

  it("keeps distinct positions independent", () => {
    const parsed = parsePageRotations("2:180,3:270", 3);
    assert.deepEqual([...parsed.entries()], [[2, 180], [3, 270]]);
  });
});
