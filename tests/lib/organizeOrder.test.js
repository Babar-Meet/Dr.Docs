import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseOrganizeOrder } from "../../utils/processors/organizeProcessor.js";
import {
  countLine,
  deleteEntries,
  duplicateEntries,
  entryReason,
  emptyOrderReason,
  moveEntry,
  orderString,
  parseOrder,
  resetEntries,
} from "../../client/src/lib/organizeOrder.js";

// The organize strip writes the server's frozen organizePages string. This
// suite pins the client lib against the server's own parser: every valid
// string must produce identical entries on both sides, and every string the
// server refuses must read as empty or invalid in the strip too.

const PAGE_COUNT = 15;
const CONDITION = "Choose how to arrange the pages before organizing.";

const valid = [
  "1,2,3",
  "3,1,2",
  "1,1",
  "15",
  "2,2,2",
  " 3 , 1 ",
  "1,,2",
];

const invalid = [
  "abc",
  "0",
  "99",
  "3abc",
  "-1",
  "1,0",
  "1,2,99",
  "1,abc,2",
];

describe("organize order round trips", () => {
  it("round trips an ordinary reorder", () => {
    const { entries, invalid: bad } = parseOrder("3,1,2", PAGE_COUNT);
    assert.equal(bad, "");
    assert.deepEqual(entries, [3, 1, 2]);
    assert.equal(orderString(entries), "3,1,2");
    assert.deepEqual(parseOrder(orderString(entries), PAGE_COUNT).entries, entries);
  });

  it("round trips duplicates", () => {
    const { entries } = parseOrder("1,1", PAGE_COUNT);
    assert.deepEqual(entries, [1, 1]);
    assert.equal(orderString(entries), "1,1");
  });

  it("round trips a delete-kept 1,3 arrangement", () => {
    const { entries } = parseOrder("1,3", 3);
    assert.deepEqual(entries, [1, 3]);
    assert.equal(orderString(entries), "1,3");
  });

  it("reads an empty string as not arranged", () => {
    for (const text of ["", "   ", " , "]) {
      const { entries, invalid: bad } = parseOrder(text, PAGE_COUNT);
      assert.deepEqual(entries, [], text);
      assert.equal(bad, "", text);
    }
    assert.equal(orderString([]), "");
    assert.equal(orderString(null), "");
  });

  it("normalizes spaces while keeping the same order", () => {
    assert.deepEqual(parseOrder(" 3 , 1 ,2 ", PAGE_COUNT).entries, [3, 1, 2]);
    assert.equal(orderString([3, 1, 2]), "3,1,2");
  });
});

describe("client parser mirrors the server parser", () => {
  for (const text of valid) {
    it(`agrees on valid: ${text}`, () => {
      const { entries, invalid: bad } = parseOrder(text, PAGE_COUNT);
      assert.equal(bad, "");
      assert.deepEqual(parseOrganizeOrder(text, PAGE_COUNT), entries);
    });
  }

  for (const text of invalid) {
    it(`agrees on invalid: ${text}`, () => {
      const { entries, invalid: bad } = parseOrder(text, PAGE_COUNT);
      assert.ok(bad !== "", text);
      assert.ok(entries.every((page) => page >= 1 && page <= PAGE_COUNT), text);
      assert.throws(
        () => parseOrganizeOrder(text, PAGE_COUNT),
        (err) =>
          err.code === "UNSUPPORTED_FILE" &&
          err.details.reason === entryReason(bad, PAGE_COUNT),
        text,
      );
    });
  }

  it("the frozen empty refusal survives: both sides refuse an empty order", () => {
    for (const text of ["", "   ", " , "]) {
      assert.throws(
        () => parseOrganizeOrder(text, PAGE_COUNT),
        (err) => err.details.reason === CONDITION,
        text,
      );
      const { entries, invalid: bad } = parseOrder(text, PAGE_COUNT);
      assert.deepEqual(entries, []);
      assert.equal(bad, "");
    }
  });

  it("carries the frozen refusal bytes", () => {
    assert.equal(emptyOrderReason(), CONDITION);
    assert.equal(
      entryReason("99", 15),
      "Invalid page: 99. Use page numbers between 1 and 15.",
    );
  });
});

describe("moveEntry", () => {
  const base = [1, 2, 3];

  it("swaps a neighbor one step left", () => {
    assert.deepEqual(moveEntry(base, 1, -1), [2, 1, 3]);
  });

  it("swaps a neighbor one step right", () => {
    assert.deepEqual(moveEntry(base, 0, 1), [2, 1, 3]);
  });

  it("moves across the whole strip", () => {
    assert.deepEqual(moveEntry(base, 2, -2), [3, 1, 2]);
    assert.deepEqual(moveEntry(base, 0, 2), [2, 3, 1]);
  });

  it("clamps past either end to a no-op", () => {
    assert.equal(moveEntry(base, 0, -1), base);
    assert.equal(moveEntry(base, 2, 1), base);
    assert.equal(moveEntry(base, 0, -99), base);
    assert.equal(moveEntry(base, 2, 99), base);
  });

  it("a zero delta and a single entry change nothing", () => {
    assert.equal(moveEntry(base, 1, 0), base);
    const solo = [1];
    assert.equal(moveEntry(solo, 0, 1), solo);
  });

  it("does not mutate the input array", () => {
    moveEntry(base, 0, 2);
    assert.deepEqual(base, [1, 2, 3]);
  });
});

describe("deleteEntries", () => {
  it("removes the selected strip positions and keeps the rest in order", () => {
    assert.deepEqual(deleteEntries([1, 2, 3], [1]), [1, 3]);
    assert.deepEqual(deleteEntries([1, 2, 3], [0, 2]), [2]);
    assert.deepEqual(deleteEntries([1, 2, 3, 1], [0, 3]), [2, 3]);
  });

  it("deletes work position by position, so twins delete independently", () => {
    const twins = [2, 2];
    assert.deepEqual(deleteEntries(twins, [0]), [2]);
    assert.deepEqual(deleteEntries(twins, [0, 1]), []);
  });

  it("an empty selection and remove-everything both behave", () => {
    assert.deepEqual(deleteEntries([1, 2, 3], []), [1, 2, 3]);
    assert.deepEqual(deleteEntries([1], [0]), []);
  });
});

describe("duplicateEntries", () => {
  it("inserts the copy right after each selected entry", () => {
    assert.deepEqual(duplicateEntries([1, 2, 3], [1]), [1, 2, 2, 3]);
    assert.deepEqual(duplicateEntries([1, 2, 3], [0]), [1, 1, 2, 3]);
  });

  it("handles several selections at once", () => {
    assert.deepEqual(duplicateEntries([1, 2, 3], [0, 2]), [1, 1, 2, 3, 3]);
    assert.deepEqual(duplicateEntries([1, 2], [0, 1]), [1, 1, 2, 2]);
  });

  it("twins duplicate independently by position", () => {
    assert.deepEqual(duplicateEntries([2, 2], [0, 1]), [2, 2, 2, 2]);
  });

  it("an empty selection changes nothing", () => {
    assert.deepEqual(duplicateEntries([1, 2, 3], []), [1, 2, 3]);
  });
});

describe("resetEntries", () => {
  it("restores 1..N for a known page count", () => {
    assert.deepEqual(resetEntries(4), [1, 2, 3, 4]);
    assert.deepEqual(resetEntries(1), [1]);
  });

  it("an unknown page count has no entries to reset to", () => {
    assert.deepEqual(resetEntries(null), []);
    assert.deepEqual(resetEntries(0), []);
  });
});

describe("countLine", () => {
  it("names output pages and moves with deletions and duplicates", () => {
    assert.equal(countLine(1), "Output: 1 page.");
    assert.equal(countLine(3), "Output: 3 pages.");
    let entries = [1, 2, 3];
    entries = deleteEntries(entries, [1]);
    assert.equal(countLine(entries.length), "Output: 2 pages.");
    entries = duplicateEntries(entries, [0]);
    assert.equal(countLine(entries.length), "Output: 3 pages.");
  });
});
