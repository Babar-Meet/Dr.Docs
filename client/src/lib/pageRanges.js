// Pure helpers for the Split tool's parts editor. The wire format stays the
// server's frozen pageRanges string: comma-separated tokens, where every
// token is one part like "1-3" or "5", and an empty string means every page
// becomes its own PDF. The parse rules mirror
// utils/processors/mergeSplitProcessor.js exactly (parseInt semantics
// included) and tests pin the two against each other.

// Parses one token into a row. A token like "1-3" splits at the first dash,
// and anything after a second dash is ignored the same way the server
// ignores it. "5-" keeps its dash so a partially typed row is never lost.
export function parseRangeRow(token) {
  const trimmed = String(token).trim();
  const dashIndex = trimmed.indexOf("-");
  if (dashIndex === -1) {
    return { fromText: trimmed, toText: trimmed, hadDash: false };
  }
  const rest = trimmed.slice(dashIndex + 1);
  const endDash = rest.indexOf("-");
  return {
    fromText: trimmed.slice(0, dashIndex).trim(),
    toText: (endDash === -1 ? rest : rest.slice(0, endDash)).trim(),
    hadDash: true,
  };
}

// String in, rows out. Empty tokens are dropped the same way the server
// drops them, so "1-3,,5" reads back as two real parts plus nothing.
export function parseRangeParts(pageRanges) {
  return String(pageRanges ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map(parseRangeRow);
}

function rowToken(row) {
  return row.hadDash ? `${row.fromText}-${row.toText}` : row.fromText;
}

// Rows back to the frozen string. The round trip is stable: the string the
// editor writes always parses back to the rows it was written from.
export function rangesStringFromRows(rows) {
  return rows.map(rowToken).join(",");
}

// Reads a row the way the server reads its token: parseInt semantics, so
// typed junk after digits ("3abc") counts as 3. pageCount, when given, adds
// the past-the-end rule the server also applies.
export function rangeRowStatus(row, pageCount = null) {
  const from = Number.parseInt(row.fromText, 10);
  const to = Number.parseInt(row.toText, 10);
  if (Number.isNaN(from)) {
    return { valid: false, from: null, to: null };
  }
  if (row.hadDash && Number.isNaN(to)) {
    return { valid: false, from: null, to: null };
  }
  if (from < 1) {
    return { valid: false, from: null, to: null };
  }
  if (row.hadDash && to < from) {
    return { valid: false, from: null, to: null };
  }
  if (pageCount !== null && to > pageCount) {
    return { valid: false, from: null, to: null };
  }
  return { valid: true, from, to };
}

// Human phrasing for the panel. Kept next to the status so the wording and
// the rule cannot drift apart.
export function rangeRowReason(row, pageCount = null) {
  const from = Number.parseInt(row.fromText, 10);
  const to = Number.parseInt(row.toText, 10);
  if (Number.isNaN(from) || (row.hadDash && Number.isNaN(to))) {
    return "Type numbers only, one page or two.";
  }
  if (from < 1) {
    return "Pages start at 1.";
  }
  if (row.hadDash && to < from) {
    return "The start page is bigger than the end page.";
  }
  if (pageCount !== null && to > pageCount) {
    return `This file has ${pageCount} pages.`;
  }
  return null;
}

// The page a fresh part starts on: the page after the highest page any
// existing part already covers, clamped to the document.
export function nextCandidatePage(rows, pageCount = null) {
  let highest = 0;
  for (const row of rows) {
    const status = rangeRowStatus(row, pageCount);
    if (status.valid && status.to > highest) {
      highest = status.to;
    }
  }
  if (highest === 0) {
    return 1;
  }
  const candidate = highest + 1;
  if (pageCount !== null && candidate > pageCount) {
    return pageCount;
  }
  return candidate;
}

// The first part whose pages cover this page, for the badges on the page
// tiles. -1 when no part covers it.
export function firstPartIndexCoveringPage(page, rows, pageCount = null) {
  for (let index = 0; index < rows.length; index++) {
    const status = rangeRowStatus(rows[index], pageCount);
    if (status.valid && status.from <= page && page <= status.to) {
      return index;
    }
  }
  return -1;
}

// The click behavior for the page tiles: a click makes the page a part on
// its own, and a second click removes that single-page part again. A page a
// bigger part already covers is owned by the rows editor, so a click there
// changes nothing and null says so.
export function togglePagePart(rows, page, pageCount = null) {
  for (let index = 0; index < rows.length; index++) {
    const status = rangeRowStatus(rows[index], pageCount);
    if (status.valid && status.from === page && status.to === page) {
      return rows.filter((_, at) => at !== index);
    }
  }
  if (firstPartIndexCoveringPage(page, rows, pageCount) !== -1) {
    return null;
  }

  let insertAt = 0;
  for (let index = 0; index < rows.length; index++) {
    const status = rangeRowStatus(rows[index], pageCount);
    if (status.valid && status.from <= page) {
      insertAt = index + 1;
    }
  }
  const row = { fromText: String(page), toText: String(page), hadDash: false };
  return [...rows.slice(0, insertAt), row, ...rows.slice(insertAt)];
}
