import Panel from "../../ui/Panel.jsx";

// Informational panels for the tools that have no inputs of their own.
// Every line states only what the server code actually does for that type.
export default function InfoOptions({ kind }) {
  if (kind === "compress") {
    return (
      <Panel>
        <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          Compress PDF
        </p>
        <p className="mt-3 font-body text-[13px] leading-[1.5] text-offWhite">
          Lossless optimize - linearizes, dedupes objects, and compresses
          streams via qpdf. Output size depends on the source file, with no
          quality loss.
        </p>
        <div className="mt-3 rounded-[5px] border border-borderDark bg-deep p-3">
          <p className="font-mono text-[11px] leading-[1.4] text-muted">
            PDFs only - Batch supported (up to 200) - 50MB per file - Encrypted
            files are never bypassed.
          </p>
        </div>
      </Panel>
    );
  }

  if (kind === "unlock") {
    return (
      <Panel>
        <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          Unlock
        </p>
        <p className="mt-2 font-body text-[13px] leading-[1.5] text-offWhite">
          Removes edit and copy restrictions only. Password-protected and
          strongly encrypted files are never bypassed.
        </p>
      </Panel>
    );
  }

  if (kind === "ocr") {
    return (
      <Panel>
        <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          OCR - Text Extraction
        </p>
        <p className="mt-2 font-body text-[13px] leading-[1.5] text-offWhite">
          Extracts text from PDFs and images. Batch supported - returns one TXT
          per file.
        </p>
        <p className="mt-2 font-mono text-[11px] text-muted">
          Uses Tesseract - English trained data included (eng.traineddata).
        </p>
      </Panel>
    );
  }

  if (kind === "repair") {
    return (
      <Panel>
        <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          Repair
        </p>
        <p className="mt-2 font-body text-[13px] leading-[1.5] text-offWhite">
          Rebuilds a damaged file and returns it in the same format: PDF, DOCX,
          PPTX, XLSX, ZIP, JPG, JPEG, or PNG.
        </p>
        <div className="mt-3 space-y-1.5">
          <p className="font-mono text-[11px] leading-[1.4] text-muted">
            PDF: rebuilt and linearized with qpdf.
          </p>
          <p className="font-mono text-[11px] leading-[1.4] text-muted">
            DOCX, PPTX: package validated and rewritten.
          </p>
          <p className="font-mono text-[11px] leading-[1.4] text-muted">
            XLSX: workbook reloaded and rewritten.
          </p>
          <p className="font-mono text-[11px] leading-[1.4] text-muted">
            ZIP: validated and rebuilt.
          </p>
          <p className="font-mono text-[11px] leading-[1.4] text-muted">
            JPG, JPEG, PNG: decoded and re-encoded.
          </p>
        </div>
        <p className="mt-3 font-body text-xs text-muted">
          Repair rebuilds file structure. Data that is already lost cannot be
          recovered, and a file that cannot be rebuilt returns an error.
          Encrypted files are never bypassed.
        </p>
      </Panel>
    );
  }

  return null;
}
