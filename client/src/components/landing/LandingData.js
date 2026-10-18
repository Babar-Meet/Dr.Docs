// Landing display data. The landing page is one flat grid of tool tiles in a
// fixed order with a tag bar that filters it. This module holds the display
// order and the per tile sentence so the shared tool data in
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
  convert: "Convert PDF",
  edit: "Edit PDF",
  security: "PDF Security",
  intelligence: "PDF Intelligence",
};

// Every tile in one flat interwoven sequence, the order the grid shows. Tag
// filters slice this same sequence, no grouped sections.
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
  "watermark-pdf": "Not built yet: stamp text or an image over PDF pages.",
  "rotate-pdf": "Rotate all pages or turn pages live, one at a time.",
  "unlock-pdf": "Remove restrictions, or open a locked PDF with its password.",
  "protect-pdf": "Add a password with 256-bit AES encryption.",
  "organize-pdf": "Not built yet: reorder and delete pages of one PDF.",
  "pdf-to-pdfa": "Not built yet: rewrite a PDF into the PDF/A archive format.",
  "repair-pdf": "Rebuild a damaged file and keep its original format.",
  "add-page-numbers": "Not built yet: stamp page numbers onto PDF pages.",
  "scan-to-pdf": "Not built yet: turn phone photos of documents into one PDF.",
  "ocr-pdf": "Extract text from PDF, Office, and image files as TXT.",
  "compare-pdf": "Not built yet: show what changed between two PDFs.",
  "redact-pdf": "Not built yet: permanently remove content from a PDF.",
  "crop-pdf": "Not built yet: trim the margins of PDF pages.",
  "pdf-to-markdown": "Not built yet: turn PDF text into Markdown headings, lists, and tables.",
  "summarize-pdf": "Not built yet: produce a short summary of a long PDF.",
  "translate-pdf": "Not built yet: translate a document into another language.",
};

export function toolsForTag(tools, tag) {
  const ids = new Map(tools.map((tool) => [tool.id, tool]));
  const ordered = [...DISPLAY_ORDER, ...EXTRAS]
    .map((id) => ids.get(id))
    .filter(Boolean);

  if (!tag || tag === "all") {
    return ordered.filter((tool) => tool.group !== "intelligence");
  }
  if (EMPTY_TAGS.includes(tag)) {
    return [];
  }
  return ordered.filter((tool) => tool.group === tag);
}

export function sentenceFor(tool) {
  return TOOL_SENTENCES[tool.id] || tool.help;
}
