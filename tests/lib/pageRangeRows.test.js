import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizePageRanges } from "../../utils/processors/mergeSplitProcessor.js";
import {
  parseRangeParts,
  rangeRowReason,
  rangeRowStatus,
  rangesStringFromRows,
  firstPartIndexCoveringPage,
  nextCandidatePage,
  togglePagePart,
} from "../../client/src/lib/pageRanges.js";

// The split panel's parts editor writes the server's frozen pageRanges
// string. This suite pins the client back to the server's own parser:
// every valid string must produce identical parts on both sides, and every
// string the server rejects must read invalid in the editor too.

function clientParts(pageRanges, pageCount) {
  return parseRangeParts(pageRanges)
    .map((row) => rangeRowStatus(row, pageCount))
    .filter((status) => status.valid)
    .map((status) => [status.from, status.to]);
}

function clientInvalid(pageRanges, pageCount) {
  return parseRangeParts(pageRanges).some(
    (row) => !rangeRowStatus(row, pageCount).valid,
  );
}

describe("split parts round trips", () => {
  it("round trips the documented example byte for byte", () => {
    const rows = parseRangeParts("1-3,5,7-10");
    assert.deepEqual(
      rows.map((row) => [row.fromText, row.toText]),
      [
        ["1", "3"],
        ["5", "5"],
        ["7", "10"],
      ],
    );
    assert.equal(rangesStringFromRows(rows), "1-3,5,7-10");
  });

  it("keeps a single number a single, undashed row", () => {
    const rows = parseRangeParts("5");
    assert.equal(rows[0].hadDash, false);
    assert.equal(rangesStringFromRows(rows), "5");
  });

  it("keeps a partially typed token byte for byte", () => {
    const rows = parseRangeParts("5-");
    assert.deepEqual(rows[0], { fromText: "5", toText: "", hadDash: true });
    assert.equal(rangesStringFromRows(rows), "5-");
    assert.equal(rangeRowStatus(rows[0], 15).valid, false);
  });

  it("keeps a token typed before its start, byte for byte", () => {
    const rows = parseRangeParts("-3");
    assert.deepEqual(rows[0], { fromText: "", toText: "3", hadDash: true });
    assert.equal(rangesStringFromRows(rows), "-3");
    assert.equal(rangeRowStatus(rows[0], 15).valid, false);
  });

  it("drops the second dash exactly like the server does", () => {
    const rows = parseRangeParts("1-2-3");
    assert.equal(rangeRowStatus(rows[0], 15).valid, true);
    assert.equal(rangesStringFromRows(rows), "1-2");
    assert.deepEqual(
      normalizePageRanges("1-2-3", 15),
      normalizePageRanges("1-2", 15),
    );
  });

  it("normalizes spaces while keeping the same parts", () => {
    const rows = parseRangeParts(" 5 - 5 , 2 ");
    assert.deepEqual(
      rows.map((row) => [row.fromText, row.toText]),
      [
        ["5", "5"],
        ["2", "2"],
      ],
    );
    assert.equal(rangesStringFromRows(rows), "5-5,2");
  });

  it("reads an empty string as no parts", () => {
    assert.deepEqual(parseRangeParts(""), []);
    assert.deepEqual(parseRangeParts(" , "), []);
  });

  it("a row emptied into a trailing comma holds no part, like on the server", () => {
    const rows = parseRangeParts("1-3");
    rows.push({ fromText: "", toText: "", hadDash: false });
    assert.equal(rangesStringFromRows(rows), "1-3,");
    assert.deepEqual(normalizePageRanges("1-3,", 15), [[1, 3]]);
  });
});

describe("client parser mirrors the server parser", () => {
  const pageCount = 15;
  const valid = [
    "1-3,5,7-10",
    "5",
    "01",
    "5-5",
    "2-2,1",
    "15",
    "3abc-4",
    "1-2-3",
    "10-15",
  ];
  const invalid = ["0", "-3", "5-", "abc", "9-1", "20", "1-20", "abc-1"];

  for (const pageRanges of valid) {
    it(`agrees on valid: ${pageRanges}`, () => {
      assert.equal(clientInvalid(pageRanges, pageCount), false);
      assert.deepEqual(
        clientParts(pageRanges, pageCount),
        normalizePageRanges(pageRanges, pageCount),
      );
    });
  }

  for (const pageRanges of invalid) {
    it(`agrees on invalid: ${pageRanges}`, () => {
      assert.equal(clientInvalid(pageRanges, pageCount), true);
      assert.throws(() => normalizePageRanges(pageRanges, pageCount));
    });
  }

  it("the frozen default survives: empty ranges means one PDF per page", () => {
    assert.deepEqual(normalizePageRanges("", 5), [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
    ]);
    assert.deepEqual(clientParts("", 5), []);
  });

  for (const [text, reason] of [
    ["5-", "Type numbers only, one page or two."],
    ["0", "Pages start at 1."],
    ["9-1", "The start page is bigger than the end page."],
    ["1-20", "This file has 15 pages."],
  ]) {
    it(`phrases the panel warning for ${text}`, () => {
      assert.equal(rangeRowReason(parseRangeParts(text)[0], 15), reason);
    });
  }
});

describe("page tile clicks", () => {
  it("clicking an uncovered page adds it as its own part in page order", () => {
    let rows = parseRangeParts("");
    rows = togglePagePart(rows, 3);
    assert.equal(rangesStringFromRows(rows), "3");
    rows = togglePagePart(parseRangeParts("1-3"), 5);
    assert.equal(rangesStringFromRows(rows), "1-3,5");
    rows = togglePagePart(parseRangeParts("1-3,5"), 7);
    assert.equal(rangesStringFromRows(rows), "1-3,5,7");
  });

  it("a later page slots between existing parts", () => {
    const rows = togglePagePart(parseRangeParts("5"), 2);
    assert.equal(rangesStringFromRows(rows), "2,5");
  });

  it("clicking a single-page part again removes it", () => {
    const rows = togglePagePart(parseRangeParts("3"), 3);
    assert.deepEqual(rows, []);
  });

  it("a click inside a bigger part changes nothing", () => {
    assert.equal(togglePagePart(parseRangeParts("1-10"), 5, 15), null);
    assert.equal(togglePagePart(parseRangeParts("1-3,5,7-10"), 9, 15), null);
  });

  it("a removed part lets the page be picked again", () => {
    let rows = parseRangeParts("3");
    rows = togglePagePart(rows, 3);
    assert.deepEqual(rows, []);
    rows = togglePagePart(rows, 3);
    assert.equal(rangesStringFromRows(rows), "3");
  });
});

describe("part badge and next candidate", () => {
  const rows = parseRangeParts("1-3,5,7-10");

  it("badges the page the first covering part owns", () => {
    assert.equal(firstPartIndexCoveringPage(4, rows, 15), -1);
    assert.equal(firstPartIndexCoveringPage(7, rows, 15), 2);
    assert.equal(firstPartIndexCoveringPage(9, rows, 15), 2);
  });

  it("suggests the page after the highest covered page", () => {
    assert.equal(nextCandidatePage([], 15), 1);
    assert.equal(nextCandidatePage(parseRangeParts("1-3"), 15), 4);
    assert.equal(nextCandidatePage(rows, 15), 11);
  });

  it("clamps the suggestion to the last page when everything is covered", () => {
    assert.equal(nextCandidatePage(parseRangeParts("1-5"), 5), 5);
  });
});
