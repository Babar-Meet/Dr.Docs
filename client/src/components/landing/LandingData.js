// Landing display data. The landing page groups the tool tiles into labeled
// sections, one per category, in a fixed order, with a tag bar that filters
// to one section. This module holds the section order, the display order and
// the per tile sentence so the shared tool data in
// client/src/lib/toolConfig.js keeps its own shape and text.

export const TAG_ORDER = [
  "all",
  "workflows",
  "organize",
  "optimize",
  "convert",
  "edit",
  "security",
  "intelligence",
];

export const TAG_LABELS = {
  all: "All",
  workflows: "Workflows",
  organize: "Organize PDF",
  optimize: "Optimize PDF",
  convert: "Convert Any To Any",
  edit: "Edit PDF",
  security: "PDF Security",
  intelligence: "PDF Intelligence",
};

// Every tile in one flat curated sequence, the order the grid shows inside
// each section. Tag filters slice this same sequence by group.
export const DISPLAY_ORDER = [
  "merge-pdf",
  "split-pdf",
  "compress-pdf",
  "pdf-to-word",
  "pdf-to-powerpoint",
  "pdf-to-excel",
  "word-to-pdf",
  "powerpoint-to-pdf",
  "excel-to-pdf",
  "edit-pdf",
  "pdf-to-jpg",
  "jpg-to-pdf",
  "html-to-pdf",
  "sign-pdf",
  "pdf-forms",
  "watermark-pdf",
  "rotate-pdf",
  "unlock-pdf",
  "protect-pdf",
  "organize-pdf",
  "pdf-to-pdfa",
  "repair-pdf",
  "add-page-numbers",
  "scan-to-pdf",
  "ocr-pdf",
  "compare-pdf",
  "redact-pdf",
  "crop-pdf",
];

// Three tools that sit outside the standard toolbox list. They only show under
// the PDF Intelligence tag, not in All, so All mirrors the standard list.
export const EXTRAS = ["pdf-to-markdown", "summarize-pdf", "translate-pdf"];

// Tags that have no tool behind them on this site.
export const EMPTY_TAGS = ["workflows"];

// Section titles for the grouped landing grid, worded so the tag bar chips
// and the section headings read the same. The convert category has no entry:
// the page renders it as the Any To Any block straight from the conversion
// hub data, not as a flat tool section.
export const SECTION_TITLES = {
  organize: "Organize PDF",
  optimize: "Optimize PDF",
  edit: "Edit PDF",
  security: "PDF Security",
  intelligence: "PDF Intelligence",
};

// Landing section order for the tool sections. The convert category is not
// here: the page renders the whole Any To Any block from the conversion hub
// data instead. Intelligence keeps its own tag and stays out of All.
const SECTION_ORDER = [
  "organize",
  "optimize",
  "edit",
  "security",
  "intelligence",
];

// One short sentence per tile, in our words, true of the code that exists.
// Queued tiles say so in the sentence itself.
export const TOOL_SENTENCES = {
  "merge-pdf": "Combine PDF, Office, and image files into one document.",
  "split-pdf": "Split one PDF into several files by page range.",
  "compress-pdf": "Shrink PDF file size without quality loss.",
  "pdf-to-word": "Convert a PDF into an editable Word file.",
  "pdf-to-powerpoint": "Convert a PDF into a PowerPoint file.",
  "pdf-to-excel": "Convert a PDF into an Excel file.",
  "word-to-pdf": "Convert a Word file to PDF.",
  "powerpoint-to-pdf": "Convert a PowerPoint file to PDF.",
  "excel-to-pdf": "Convert an Excel file to PDF.",
  "edit-pdf": "Not built yet: add text, images, and shapes to a PDF.",
  "pdf-to-jpg": "Not built yet: export each PDF page as a JPG image.",
  "jpg-to-pdf": "Turn JPG and PNG images into a PDF, one image per page.",
  "html-to-pdf": "Not built yet: turn a web page or an HTML file into a PDF.",
  "sign-pdf": "Not built yet: place a drawn or uploaded signature on a PDF.",
  "pdf-forms": "Not built yet: fill in existing form fields or add new ones.",
  "watermark-pdf": "Stamp text over every page of a PDF.",
  "rotate-pdf": "Rotate all pages or turn pages live, one at a time.",
  "unlock-pdf": "Remove restrictions, or open a locked PDF with its password.",
  "protect-pdf": "Add a password with 256-bit AES encryption.",
  "organize-pdf": "Not built yet: reorder and delete pages of one PDF.",
  "pdf-to-pdfa": "Not built yet: rewrite a PDF into the PDF/A archive format.",
  "repair-pdf": "Rebuild a damaged file and keep its original format.",
  "add-page-numbers": "Stamp 1, 2, 3 in nine positions.",
  "scan-to-pdf": "Not built yet: turn phone photos of documents into one PDF.",
  "ocr-pdf": "Extract text from PDF, Office, and image files as TXT.",
  "compare-pdf": "Not built yet: show what changed between two PDFs.",
  "redact-pdf": "Not built yet: permanently remove content from a PDF.",
  "crop-pdf": "Not built yet: trim the margins of PDF pages.",
  "pdf-to-markdown": "Not built yet: turn PDF text into Markdown headings, lists, and tables.",
  "summarize-pdf": "Not built yet: produce a short summary of a long PDF.",
  "translate-pdf": "Not built yet: translate a document into another language.",
};

// One labeled section per category. The All view stacks the four tool
// sections in SECTION_ORDER; the conversion category is not flattened into a
// section because the page renders it as the Any To Any conversion block
// from the hub data, where every pair shows exactly once. A tag filter
// yields exactly that group's section; an empty tag yields none. Sections
// with no tools do not render.
export function toolSections(tools, tag) {
  const ids = new Map(tools.map((tool) => [tool.id, tool]));
  const ordered = [...DISPLAY_ORDER, ...EXTRAS]
    .map((id) => ids.get(id))
    .filter(Boolean);

  const groups =
    !tag || tag === "all"
      ? SECTION_ORDER.filter((group) => group !== "intelligence")
      : EMPTY_TAGS.includes(tag)
        ? []
        : [tag];

  return groups
    .map((group) => ({
      group,
      title: SECTION_TITLES[group] || group,
      tools: ordered.filter((tool) => tool.group === group),
    }))
    .filter((section) => section.tools.length > 0);
}

export function sentenceFor(tool) {
  return TOOL_SENTENCES[tool.id] || tool.help;
}
