// PDF page count and encryption detection for the client. pdf-lib is loaded
// on demand so the page tools pay for it only when someone picks a PDF.
export async function readPdfMeta(file) {
  const { PDFDocument } = await import("pdf-lib");
  const bytes = await file.arrayBuffer();

  try {
    const pdf = await PDFDocument.load(bytes);
    return { pages: pdf.getPageCount(), encrypted: false, damaged: "" };
  } catch (error) {
    const encrypted = /encrypt/i.test(error?.message || "");
    if (!encrypted) {
      return { pages: 0, encrypted: false, damaged: "This PDF may be damaged" };
    }
    try {
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      return { pages: pdf.getPageCount(), encrypted: true, damaged: "" };
    } catch {
      // A protected file the browser cannot peek into still gets its password
      // badge; page counts only come from unprotected libraries.
      return { pages: 0, encrypted: true, damaged: "" };
    }
  }
}
