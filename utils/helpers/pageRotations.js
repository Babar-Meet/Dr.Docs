// Shared parser for the additive rotations wire field. The rotate tool applies
// each angle to a source page; the organize tool applies it to a position in
// the output order. Both must read the field and refuse a bad one exactly
// alike, so the rule lives here once and the two processors call it.
//
// Tokens are trimmed and empty tokens are dropped, so an absent or blank field
// returns null and the caller keeps its no-rotation path. Every remaining
// token must be a page:angle pair with an integer position inside
// 1..pageCount, an angle of exactly 90, 180 or 270, and no position listed
// twice. The first bad token refuses the request; nothing is ignored.
import { AppError } from "../errors.js";

function invalidRotation(reason) {
  return new AppError("Unsupported file", "UNSUPPORTED_FILE", 400, { reason });
}

export function parsePageRotations(rotationsRaw, pageCount) {
  const raw = String(rotationsRaw ?? "").trim();
  if (!raw) return null;

  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) return null;

  const byPage = new Map();
  for (const token of tokens) {
    if (!/^\d+:\d+$/.test(token)) {
      throw invalidRotation(
        `Invalid rotation entry: ${token}. Use page:angle pairs like 1:90.`,
      );
    }
    const separatorIndex = token.indexOf(":");
    const pageRaw = token.slice(0, separatorIndex);
    const angleRaw = token.slice(separatorIndex + 1);
    const pageNumber = Number.parseInt(pageRaw, 10);
    const angle = Number.parseInt(angleRaw, 10);

    if (Number.isNaN(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
      throw invalidRotation(
        `Invalid rotation entry: ${token}. Page ${pageRaw} is past the last page (${pageCount} pages).`,
      );
    }
    if (Number.isNaN(angle) || ![90, 180, 270].includes(angle)) {
      throw invalidRotation(
        `Invalid rotation entry: ${token}. Supported angles are 90, 180, 270.`,
      );
    }
    if (byPage.has(pageNumber)) {
      throw invalidRotation(
        `Invalid rotation entry: page ${pageNumber} is listed more than once.`,
      );
    }
    byPage.set(pageNumber, angle);
  }

  if (byPage.size === 0) {
    throw invalidRotation(`Invalid rotation entry: ${raw}`);
  }
  return byPage;
}
