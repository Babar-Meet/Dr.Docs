// Builds the Conversions page data: one section per source format Dr.Docs can
// convert from, with every target as either a live tool link or a Coming soon
// tile. The live set comes from the client CONVERSION_TARGETS mirror in
// conversionTargets.js. That mirror must stay in sync with utils/constants.js
// (tests/lib/conversionsHub.test.js pins both together), so the page can never
// drift from the server's real conversion set.
import { CONVERSION_TARGETS } from "./conversionTargets.js";
import { TOOLS } from "./toolConfig.js";
import { WandSparkles } from "lucide-react";

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
  doc: "DOC",
  epub: "ePub",
  odp: "OpenDocument Slides",
  ppt: "PPT",
  ods: "OpenDocument Sheets",
  xls: "XLS",
  csv: "CSV",
  jpg: "JPG",
  jpeg: "JPG",
  png: "PNG",
  webp: "WebP",
  avif: "AVIF",
  tiff: "TIFF",
  pdfa: "PDF/A",
};

// Standard file-type badge colors, the same color coding every file manager
// shows: red for PDF, blue for Word documents, green for spreadsheets, orange
// for slides. The Adobe and Microsoft logo artwork itself is trademarked and
// the design system forbids brand assets, so the format name sits on its
// conventional color instead - recognizable at a glance and safe to ship.
export const FORMAT_COLORS = {
  pdf: "#D13438",
  pdfa: "#D13438",
  docx: "#2B579A",
  doc: "#2B579A",
  odt: "#2B579A",
  rtf: "#2B579A",
  xlsx: "#217346",
  xls: "#217346",
  csv: "#217346",
  ods: "#217346",
  pptx: "#D24726",
  ppt: "#D24726",
  odp: "#D24726",
  jpg: "#8E44AD",
  jpeg: "#8E44AD",
  png: "#8E44AD",
  webp: "#8E44AD",
  avif: "#8E44AD",
  tiff: "#8E44AD",
  txt: "#6B7280",
  html: "#E44D26",
  epub: "#0D9488",
};

// Badge letters shown in the source badge of each section's tiles. They use
// the plain extension text so the hub tiles and the conversion pages spell
// the file type the same way.
export const SECTION_SOURCES = [
  { key: "pdf", sourceLabel: "PDF", badge: "PDF", heading: "PDF to any", ext: ".pdf", sourceExtensions: [".pdf"] },
  { key: "docx", sourceLabel: "Word", badge: "DOCX", heading: "Word to any", ext: ".docx", sourceExtensions: [".docx"] },
  { key: "pptx", sourceLabel: "PowerPoint", badge: "PPTX", heading: "PowerPoint to any", ext: ".pptx", sourceExtensions: [".pptx"] },
  { key: "xlsx", sourceLabel: "Excel", badge: "XLSX", heading: "Excel to any", ext: ".xlsx", sourceExtensions: [".xlsx"] },
  { key: "jpg", sourceLabel: "JPG", badge: "JPG", heading: "JPG to any", ext: ".jpg, .jpeg", sourceExtensions: [".jpg", ".jpeg"] },
  { key: "png", sourceLabel: "PNG", badge: "PNG", heading: "PNG to any", ext: ".png", sourceExtensions: [".png"] },
];

// Queued conversions per section key, matching the queued landing tiles
// (pdf-to-jpg, pdf-to-pdfa). Everything a section does not list here exists
// today through a dedicated tool page or the generic Convert tool.
const COMING_SOON_NOTES = {
  pdf: [
    {
      targetKey: "jpg",
      extension: ".jpg",
      note: "Convert .pdf files to .jpg. Not built yet: each PDF page would export as one JPG image.",
    },
    {
      targetKey: "png",
      extension: ".png",
      note: "Convert .pdf files to .png. Not built yet: each PDF page would export as one PNG image.",
    },
    {
      targetKey: "pdfa",
      extension: ".pdf",
      note: "Convert .pdf files to .pdf (PDF/A). Not built yet: the ISO PDF/A archive rewrite.",
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
// exact source extension set and target. Every other live pair gets its own
// screen under /convert/<source>-to-<target>.
function dedicatedToolFor(sourceExtension, targetKey) {
  return TOOLS.find(
    (tool) =>
      tool.operation === "convert" &&
      tool.targetFormat === targetKey &&
      Array.isArray(tool.sourceExtensions) &&
      tool.sourceExtensions.includes(sourceExtension),
  );
}

function tileLabel(section, targetKey) {
  const targetLabel = FORMAT_LABELS[targetKey] || targetKey.toUpperCase();
  return `${section.sourceLabel} -> ${targetLabel}`;
}

function liveTilesFor(section) {
  const seen = new Set();
  const tiles = [];
  const sourceExt = `.${section.key}`;
  for (const sourceExtension of section.sourceExtensions) {
    for (const rawTarget of CONVERSION_TARGETS[sourceExtension] || []) {
      const targetKey = normalizeTargetKey(rawTarget);
      if (seen.has(targetKey)) continue;
      seen.add(targetKey);
      const dedicated = dedicatedToolFor(sourceExtension, targetKey);
      const targetExt = `.${targetKey}`;
      tiles.push({
        id: `${section.key}-${targetKey}`,
        targetKey,
        label: tileLabel(section, targetKey),
        sourceText: section.badge,
        sourceColor: FORMAT_COLORS[section.key],
        targetText: targetExt.replace(".", "").toUpperCase(),
        targetColor: FORMAT_COLORS[targetKey],
        extension: targetExt,
        implemented: true,
        href: dedicated ? `/${dedicated.slug}` : `/convert/${section.key}-to-${targetKey}`,
        note: `Convert ${sourceExt} files to ${targetExt}.`,
      });
    }
  }
  return tiles;
}

function soonTilesFor(section) {
  return (COMING_SOON_NOTES[section.key] || []).map(({ targetKey, extension, note }) => ({
    id: `${section.key}-soon-${targetKey}`,
    targetKey,
    label: tileLabel(section, targetKey),
    sourceText: section.badge,
    sourceColor: FORMAT_COLORS[section.key],
    targetText: extension.replace(".", "").toUpperCase(),
    targetColor: FORMAT_COLORS[targetKey],
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

// Tool-shaped object for one live pair that has no dedicated tool page. The
// pair page (/convert/<source>-to-<target>) renders it through ToolPage, so
// the screen is specific: the title and badges carry the pair, the target is
// locked, and no format picker shows. Dedicated pairs keep their existing
// pages; unknown slugs return null and the route falls back to the hub.
export function findPairTool(slug) {
  if (typeof slug !== "string") return null;
  for (const section of SECTION_SOURCES) {
    const seen = new Set();
    for (const sourceExtension of section.sourceExtensions) {
      for (const rawTarget of CONVERSION_TARGETS[sourceExtension] || []) {
        const targetKey = normalizeTargetKey(rawTarget);
        if (seen.has(targetKey)) continue;
        seen.add(targetKey);
        if (dedicatedToolFor(sourceExtension, targetKey)) continue;
        const pair = `${section.key}-to-${targetKey}`;
        if (slug !== pair) continue;
        const note = `Convert .${section.key} files to .${targetKey}.`;
        return {
          id: `convert-${pair}`,
          label: tileLabel(section, targetKey),
          slug: pair,
          group: "convert",
          icon: WandSparkles,
          available: true,
          operation: "convert",
          kind: "convert",
          sourceExtensions: section.sourceExtensions,
          targetFormat: targetKey,
          multiple: true,
          accept: section.sourceExtensions.join(","),
          help: note,
          detail: note,
        };
      }
    }
  }
  return null;
}
