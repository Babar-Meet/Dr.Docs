// Renders one selected PDF's pages to small JPEG previews with pdf.js so the
// rotate tool can show a live preview. The import is dynamic and lives in a
// separate lazy chunk, so nothing here loads for the other tools. The worker
// is bundled as an asset URL; the browser fetches it only when a PDF is first
// rendered.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const PREVIEW_CHUNK_LIMIT = 60;

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

function scaleToFit(viewport, targetWidth) {
  if (viewport.width <= 0) return 1;
  return targetWidth / viewport.width;
}

// Renders every page at preview size. Returns entries as they complete through
// onEntry so a long document fills in progressively. Pages past the cap get a
// text-only entry with no thumbnail so very large files stay responsive.
export async function renderPdfThumbnails(file, { targetWidth = 155, onEntry } = {}) {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const total = doc.numPages;
  const entries = [];

  const limit = Math.min(total, PREVIEW_CHUNK_LIMIT);

  for (let pageNumber = 1; pageNumber <= limit; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const scale = scaleToFit(page.getViewport({ scale: 1 }), targetWidth);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const context = canvas.getContext("2d");
    await page.render({ canvasContext: context, viewport }).promise;
    const entry = {
      page: pageNumber,
      baseRotation: ((page.rotate || 0) % 360 + 360) % 360,
      thumbnail: canvas.toDataURL("image/jpeg", 0.7),
    };
    entries.push(entry);
    onEntry?.(entry);
  }

  for (let pageNumber = limit + 1; pageNumber <= total; pageNumber += 1) {
    // No raster past the cap; the page's existing rotation still shows so the
    // rotation buttons behave the same as the previewed pages.
    const page = await doc.getPage(pageNumber);
    const entry = {
      page: pageNumber,
      baseRotation: ((page.rotate || 0) % 360 + 360) % 360,
      thumbnail: "",
    };
    entries.push(entry);
    onEntry?.(entry);
  }

  return { total, entries };
}
