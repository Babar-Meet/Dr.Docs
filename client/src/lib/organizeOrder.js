// Pure helpers for the Organize tool's page strip. The wire format is the
// server's frozen organizePages string: comma-separated ORIGINAL page
// numbers in OUTPUT order. "3,1,2" makes old page 3 the first output page,
// a repeated number keeps the page twice, a missing number deletes the
// page, and an empty string means nothing is arranged yet. The parse rules
// mirror utils/processors/organizeProcessor.js (parseOrganizeOrder) exactly
// and tests pin the two against each other.

// Parses the wire string the way the server reads it. Returns the ordered
// entries up to the first bad token and that token, so invalid input never
// produces a half-order that looks valid. An empty or whitespace-only
// string parses as no entries with no invalid token: not arranged yet.
export function parseOrder(organizePages, pageCount = null) {
  const tokens = String(organizePages ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return { entries: [], invalid: "" };
  }

  const entries = [];
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) {
      return { entries, invalid: token };
    }
    const page = Number.parseInt(token, 10);
    if (page < 1 || (pageCount !== null && page > pageCount)) {
      return { entries, invalid: token };
    }
    entries.push(page);
  }
  return { entries, invalid: "" };
}

// Entries back to the frozen string. The round trip is stable: the strip
// writes only what it parsed, so a written string always parses back to the
// entries it was written from.
export function orderString(entries) {
  return (entries ?? []).map((page) => String(page)).join(",");
}

// Moves the entry at index by delta positions. delta is read in the index
// space of the original array, so a drag from index i onto index j is the
// same call as the move buttons with j - i. The target is clamped to the
// array bounds: moves past either end keep the entries unchanged.
export function moveEntry(entries, index, delta) {
  if (entries.length < 2 || delta === 0) {
    return entries;
  }
  const count = entries.length;
  const target = Math.min(Math.max(index + delta, 0), count - 1);
  if (target === index) {
    return entries;
  }
  // The entry is removed first, so the landing position shifts for moves
  // toward the end. Splicing at target in the shortened array lands it
  // exactly at target in the finished array.
  const next = [...entries];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}

// Deletes every entry at the given strip positions. Positions name output
// entries, not page numbers, so two tiles showing the same page delete
// independently. The remaining order is preserved.
export function deleteEntries(entries, indices) {
  const doomed = new Set(indices);
  return entries.filter((_, index) => !doomed.has(index));
}

// Copies each selected entry and inserts the copy right after it. Inserted
// from the highest position down so every copy lands directly beside the
// entry it was made from.
export function duplicateEntries(entries, indices) {
  const next = [...entries];
  for (const index of [...indices].sort((a, b) => b - a)) {
    const current = next[index];
    if (current === undefined) continue;
    next.splice(index, 0, current);
  }
  return next;
}

// The fresh 1..N arrangement the strip falls back to. An unknown page count
// has no N, so it resets to an empty arrangement.
export function resetEntries(pageCount) {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    return [];
  }
  return Array.from({ length: pageCount }, (_, index) => index + 1);
}

// The frozen refusals, kept next to the parser so the wording and the rule
// cannot drift apart. Both carry the exact bytes the server answers with.
export function emptyOrderReason() {
  return "Choose how to arrange the pages before organizing.";
}

// A committed arrangement that ends with zero entries is a different state
// from nothing arranged yet: the user deleted the last page now, so the
// untouched "choose how" hint would read like nothing was done. This names
// the rule instead: an organize output cannot be a zero-page file.
export function emptyArrangedReason() {
  return "An organize output must keep at least one page. Add a page back or reset the order.";
}

export function entryReason(token, pageCount) {
  return `Invalid page: ${token}. Use page numbers between 1 and ${pageCount}.`;
}

// One quarter turn on the tile at a strip position. Presses accumulate, and a
// full turn removes the entry, so the map only ever holds 90, 180, or 270.
export function rotateEntry(rotations, index, delta = 90) {
  const current = (rotations && rotations[index]) || 0;
  const next = (current + delta) % 360;
  const copy = { ...(rotations || {}) };
  if (next === 0) {
    delete copy[index];
  } else {
    copy[index] = next;
  }
  return copy;
}

// The rotation map back to the frozen wire string: 1-based output positions in
// ascending order, as in "3:90,5:180". An empty map is "".
export function serializeRotations(rotations) {
  if (!rotations || typeof rotations !== "object") return "";
  const entries = Object.entries(rotations)
    .map(([idx, deg]) => [Number.parseInt(idx, 10), deg])
    .filter(([idx, deg]) => !Number.isNaN(idx) && [90, 180, 270].includes(deg))
    .sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) return "";
  return entries.map(([idx, deg]) => `${idx + 1}:${deg}`).join(",");
}

// Carries the rotation map through an order change. sourceIndices is the new
// arrangement written as old positions: sourceIndices[newIndex] = oldIndex.
// Each rotation moves to the position its tile moved to, a position with no
// source rotation stays empty, and a position that no longer exists is
// dropped. Returns a new object and never mutates the input.
export function remapRotations(rotations, sourceIndices) {
  const source = rotations && typeof rotations === "object" ? rotations : {};
  const positions = Array.isArray(sourceIndices) ? sourceIndices : [];
  const next = {};
  positions.forEach((oldIndex, newIndex) => {
    const angle = source[oldIndex];
    if ([90, 180, 270].includes(angle)) {
      next[newIndex] = angle;
    }
  });
  return next;
}

// The live count line under the strip. It names output pages: after a
// duplicate or a delete the number moves with the arrangement, not the file.
export function countLine(count) {
  return `Output: ${count} page${count === 1 ? "" : "s"}.`;
}
