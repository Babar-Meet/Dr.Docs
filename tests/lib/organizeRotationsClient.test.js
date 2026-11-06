// Pins the client-side rotation helpers that keep a tile's rotation attached
// to the tile through move, drag reorder, delete and duplicate.
// Tier: Critical, because a wrong remap rotates the wrong output page and the
// user cannot see it until the file downloads.
//
// Frozen contract (Temp/FIX_SPEC.md):
//   rotateEntry and serializeRotations keep their current signatures.
//   remapRotations(rotations, sourceIndices) -> new object where
//   sourceIndices[newIndex] = oldIndex, missing source rotations are dropped,
//   and the input is never mutated.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  remapRotations,
  rotateEntry,
  serializeRotations,
} from "../../client/src/lib/organizeOrder.js";

describe("client organizeOrder rotation helpers", () => {
  it("rotateEntry cycles through 90, 180, 270, and 0 (delete)", () => {
    let map = {};
    map = rotateEntry(map, 0, 90);
    assert.deepEqual(map, { 0: 90 });

    map = rotateEntry(map, 0, 90);
    assert.deepEqual(map, { 0: 180 });

    map = rotateEntry(map, 0, 90);
    assert.deepEqual(map, { 0: 270 });

    map = rotateEntry(map, 0, 90);
    assert.deepEqual(map, {});
  });

  it("rotateEntry keeps other positions intact", () => {
    const map = rotateEntry({ 0: 90 }, 2, 180);
    assert.deepEqual(map, { 0: 90, 2: 180 });
  });

  it("rotateEntry never mutates the input map", () => {
    const before = { 0: 90 };
    rotateEntry(before, 0, 90);
    rotateEntry(before, 1, 270);
    assert.deepEqual(before, { 0: 90 });
  });

  it("serializeRotations formats 1-based output positions", () => {
    assert.equal(serializeRotations({}), "");
    assert.equal(serializeRotations(null), "");
    assert.equal(serializeRotations({ 0: 90 }), "1:90");
    assert.equal(serializeRotations({ 2: 180, 0: 90 }), "1:90,3:180");
  });
});

describe("remapRotations", () => {
  it("identity keeps every rotation where it was", () => {
    assert.deepEqual(remapRotations({ 0: 90, 2: 180 }, [0, 1, 2]), { 0: 90, 2: 180 });
  });

  it("moves a rotation with its tile when the tile moves left", () => {
    // New order 2,0,1: old page 2 is now first, old page 0 is now second.
    assert.deepEqual(remapRotations({ 0: 90, 2: 180 }, [2, 0, 1]), { 0: 180, 1: 90 });
  });

  it("moves a rotation with its tile when the tile moves right", () => {
    // New order 1,2,0: old page 0 is now third, old page 2 is now second.
    assert.deepEqual(remapRotations({ 0: 90, 2: 180 }, [1, 2, 0]), { 1: 180, 2: 90 });
  });

  it("drops a rotation whose source page was deleted", () => {
    // Old page 1 is deleted; old page 2 takes new index 1.
    assert.deepEqual(remapRotations({ 0: 90, 1: 270, 2: 180 }, [0, 2]), { 0: 90, 1: 180 });
  });

  it("copies a rotation onto every duplicate of its source page", () => {
    assert.deepEqual(remapRotations({ 0: 90, 1: 270 }, [0, 1, 1]), { 0: 90, 1: 270, 2: 270 });
    assert.deepEqual(remapRotations({ 2: 180 }, [2, 2, 2]), { 0: 180, 1: 180, 2: 180 });
  });

  it("returns an empty object for no tiles or no rotations", () => {
    assert.deepEqual(remapRotations({ 0: 90 }, []), {});
    assert.deepEqual(remapRotations({}, [0, 1, 2]), {});
    assert.deepEqual(remapRotations(null, [0, 1]), {});
    assert.deepEqual(remapRotations(undefined, [0, 1]), {});
  });

  it("leaves a source tile with no rotation without an entry", () => {
    assert.deepEqual(remapRotations({ 0: 90 }, [1, 0]), { 1: 90 });
    assert.deepEqual(remapRotations({ 1: 270 }, [1, 2]), { 0: 270 });
  });

  it("returns a new object and never mutates its inputs", () => {
    const rotations = { 0: 90, 2: 180 };
    const sourceIndices = [2, 0, 1];
    const result = remapRotations(rotations, sourceIndices);

    assert.notEqual(result, rotations, "the helper must return a new object");
    assert.deepEqual(rotations, { 0: 90, 2: 180 }, "the rotations input must not be mutated");
    assert.deepEqual(sourceIndices, [2, 0, 1], "the source index list must not be mutated");

    const identity = remapRotations(rotations, [0, 1, 2]);
    assert.notEqual(identity, rotations, "identity must also return a new object");
    assert.deepEqual(identity, rotations);
  });

  it("composes with moveEntry and serializeRotations for the request string", () => {
    // The strip is [1,2,3] with rotations on old pages 1 and 3. Move old page
    // 3 to the front, then serialize: the declaration follows the tile.
    const oldRotations = { 0: 90, 2: 270 };
    const moved = [3, 1, 2].map((pageNumber) => pageNumber - 1);
    const remapped = remapRotations(oldRotations, moved);
    assert.deepEqual(remapped, { 0: 270, 1: 90 });
    assert.equal(serializeRotations(remapped), "1:270,2:90");
  });
});
