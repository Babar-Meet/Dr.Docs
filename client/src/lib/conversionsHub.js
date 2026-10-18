// Builds the Conversions page data: one section per source format Dr.Docs can
// convert from, with every target as either a live tool link or a Coming soon
// tile. The live set comes from the client CONVERSION_TARGETS mirror in
// conversionTargets.js. That mirror must stay in sync with utils/constants.js
// (tests/lib/conversionsHub.test.js pins both together), so the page can never
// drift from the server's real conversion set.
import { CONVERSION_TARGETS } from "./conversionTargets.js";
import { TOOLS } from "./toolConfig.js";

// Friendly label per target key (no dot). Must cover every target the mirror
// lists plus the queued pairs below.
export const FORMAT_LABELS = {
  pdf: "PDF",
  docx: "Word",
  pptx: "PowerPoint",
  xlsx: "Excel",
  odt: "OpenDocument Text",
  rtf: "RTF",
  txt: "Plain text",
  html: "HTML",
  doc: "Word .doc",
  epub: "ePub",
  odp: "OpenDocument Slides",
  ppt: "PowerPoint .ppt",
  ods: "OpenDocument Sheets",
  xls: "Excel .xls",
  csv: "CSV",
  jpg: "JPG",
  jpeg: "JPG",
  png: "PNG",
  webp: "WebP",
  avif: "AVIF",
  tiff: "TIFF",
  pdfa: "PDF/A",
};

// One section per source format. Aliased extensions (.jpg and .jpeg) collapse
// into one section so the same format never shows twice.
export const SECTION_SOURCES = [
  { key: "pdf", heading: "PDF to any", ext: ".pdf", sourceExtensions: [".pdf"] },
  { key: "docx", heading: "Word to any", ext: ".docx", sourceExtensions: [".docx"] },
  { key: "pptx", heading: "PowerPoint to any", ext: ".pptx", sourceExtensions: [".pptx"] },
  { key: "xlsx", heading: "Excel to any", ext: ".xlsx", sourceExtensions: [".xlsx"] },
  { key: "jpg", heading: "JPG to any", ext: ".jpg, .jpeg", sourceExtensions: [".jpg", ".jpeg"] },
  { key: "png", heading: "PNG to any", ext: ".png", sourceExtensions: [".png"] },
];

// Queued conversions per section key, matching the queued landing tiles
// (pdf-to-jpg, pdf-to-pdfa). Everything a section does not list here exists
// today through a dedicated tool page or the generic Convert tool.
const COMING_SOON_NOTES = {
  pdf: [
    {
      targetKey: "jpg",
      extension: ".jpg",
      note: "Not built yet: export each PDF page as a JPG image.",
    },
    {
      targetKey: "png",
      extension: ".png",
      note: "Not built yet: export each PDF page as a PNG image.",
    },
    {
      targetKey: "pdfa",
      extension: ".pdf",
      note: "Not built yet: rewrite a PDF into the PDF/A archive format.",
    },
  ],
  docx: [],
  pptx: [],
  xlsx: [],
  jpg: [],
  png: [],
};

// .png lists both jpg and jpeg as targets: they are one format shown once.
const TARGET_ALIASES = { jpeg: "jpg" };

function normalizeTargetKey(targetKey) {
  return TARGET_ALIASES[targetKey] || targetKey;
}

// A dedicated tool page for a pair only when a live convert tool carries the
// exact source extension set and target. Otherwise the pair runs through the
// generic Convert tool (/convert-pdf), which supports every live pair.
function dedicatedToolFor(sourceExtension, targetKey) {
  return TOOLS.find(
    (tool) =>
      tool.operation === "convert" &&
      tool.targetFormat === targetKey &&
      Array.isArray(tool.sourceExtensions) &&
      tool.sourceExtensions.includes(sourceExtension),
  );
}

function liveTilesFor(section) {
  const seen = new Set();
  const tiles = [];
  for (const sourceExtension of section.sourceExtensions) {
    for (const rawTarget of CONVERSION_TARGETS[sourceExtension] || []) {
      const targetKey = normalizeTargetKey(rawTarget);
      if (seen.has(targetKey)) continue;
      seen.add(targetKey);
      const dedicated = dedicatedToolFor(sourceExtension, targetKey);
      tiles.push({
        id: `${section.key}-${targetKey}`,
        targetKey,
        label: FORMAT_LABELS[targetKey] || targetKey.toUpperCase(),
        extension: `.${targetKey}`,
        implemented: true,
        href: dedicated ? `/${dedicated.slug}` : "/convert-pdf",
        note: dedicated
          ? dedicated.help
          : "Works through the Convert tool: pick your files, then choose this target.",
      });
    }
  }
  return tiles;
}

function soonTilesFor(section) {
  return (COMING_SOON_NOTES[section.key] || []).map(({ targetKey, extension, note }) => ({
    id: `${section.key}-soon-${targetKey}`,
    targetKey,
    label: FORMAT_LABELS[targetKey] || targetKey.toUpperCase(),
    extension,
    implemented: false,
    href: null,
    note,
  }));
}

export function buildConversionSections() {
  return SECTION_SOURCES.map((section) => {
    const tiles = [...liveTilesFor(section), ...soonTilesFor(section)];
    return {
      ...section,
      tiles,
      liveCount: tiles.filter((tile) => tile.implemented).length,
    };
  });
}
