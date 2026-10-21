# Dr.Docs - Technical Documentation

## Overview
**Dr.Docs** is a specialized web application designed for students and faculty to securely unlock, convert, merge, split, rotate, compress, repair, and OCR files. It is built as a monorepo (npm workspaces `client` and `server`) with a React frontend and an Express backend, using a modular processor system to handle various file formats.

---

##  Architecture

### 1. Monorepo Structure
- `/client`: React frontend (Vite + TailwindCSS)
- `/server`: Express backend (Node.js)
- `/utils`: Common processing logic, helpers, and constants. Not an npm workspace; the server imports it by relative path.

### 2. File Processing Pipeline
The processing flow is managed by a centralized router (`/utils/processors/router.js`) which:
1. Validates the file extension and declared MIME type. Magic-byte signature checks for encryption happen later, inside the processors; XLSX is the exception, matched by ExcelJS error text instead of a header check.
2. Identifies the requested mode (`unlock`, `convert`, `merge`, `split`, `ocr`, `rotate`, `compress`, `repair`, `protect`, `watermark`, `pagenumbers`, `organize`), rejecting anything else with 400 `UNSUPPORTED_FILE`.
3. Dispatches the task to the specific file processor (PDF, Office, Image, etc.).
4. Returns one output descriptor per generated file.

After the router returns, `processService.processUploadedFile` deletes the uploaded originals and the per-job work directory in a `finally` block (`server/src/services/processService.js:151-163`). Outputs are not touched there; they are removed when downloaded, or by the TTL sweep.

---

##  Key Components

###  Backend (Express)
- **`multer`**: Handles multipart/form-data uploads.
- **`AsyncTaskQueue`**: An in-memory FIFO queue that runs at most 2 high-resource tasks (like LibreOffice conversions) at a time, so concurrent hits never put more than 2 LibreOffice or qpdf processes in flight. Each LibreOffice conversion additionally borrows its own user profile slot (`utils/helpers/libreOfficeProfile.js`), passed to `soffice` as `-env:UserInstallation` under the OS temp directory, so two conversions cannot collide inside one shared profile. A slot is reused once its conversion finishes, and a profile root left by a dead process is removed by the next process that starts.
- **`downloadStore`**: Manages the mapping of unique IDs to generated files, allowing users to securely download their processed results via a single-use ID.

###  Frontend (React)
- **Drag-and-Drop**: Built using native HTML5 drag-and-drop combined with a clean UI.
- **Vite Proxy**: Configured to proxy API requests from `:5173` to `:5000` for development.

###  Processor Modules
- **qpdf**: Used for removing PDF restrictions and, in `repair` mode, for rebuilding a damaged PDF with `--linearize`.
- **LibreOffice (soffice)**: Powers the heavy-lifting conversions (e.g., DOCX to PDF).
- **jszip**: Reads and rewrites Word and PowerPoint OOXML to strip editing protections (`w:documentProtection` and `w:writeProtection` in `word/settings.xml`, `p:modifyVerifier` and `p:writeProtection` in `ppt/*.xml`). **mammoth**: parses the DOCX package, `word/document.xml` included, but never rewrites OOXML. In the unlock path it is a DOCX readability probe whose result is discarded; it exists only to map parser password errors to `PASSWORD_REQUIRED`. In the OCR path it extracts DOCX text.
- **exceljs**: Modifies spreadsheet sheet protection flags.
- **sharp**: Decodes images, applies `.rotate()` for EXIF orientation, and re-encodes to jpg, png, webp, avif or tiff. **pdf-lib**: Embeds images into PDFs for image-to-PDF, via `PDFDocument.embedPng`/`embedJpg`, and performs PDF merge, split and rotate plus the `PDFDocument.load` that detects encryption and corruption.

###  Pairs that skip soffice: the txt gate and the merged-PDF infilter

- Convert pairs `.pdf` to `.txt`, `.pptx` to `.txt` and `.xlsx` to `.txt` never reach `soffice`: LibreOffice imports those sources as Draw, Impress and Calc documents, and none of those modules carries a plain-text export filter, so every such call answered `no export filter`. `convert` routes exactly those three pairs (`usesInlineTextExtractors` in `utils/processors/conversionProcessor.js`) through the extractors the `ocr` operation already runs in process: pdf-parse for PDF, the JSZip `a:t` parse for PPTX, ExcelJS for XLSX. Every other declared pair, including `.docx` to `.txt`, keeps the soffice path. The pdf branch hands pdf-parse a dedicated `new Uint8Array` copy of the file, because pdf-parse's bundled pdf.js cannot parse a Buffer whose backing ArrayBuffer is Node's shared pool (any small file then reads as `Invalid PDF structure`); an encrypted PDF still fails `PASSWORD_REQUIRED` 400 with `SECURE_ENCRYPTION_MESSAGE` there because the pdf-parse password check runs before any text is written.
- `merge` to `targetFormat: docx` passes `PDF_INTO_WRITER_INFILTER` (`writer_pdf_import`) to its single soffice call, so LibreOffice loads the merged PDF into a Writer document and exports it with the `Office Open XML Text` filter; a Draw document cannot use that filter and answers `no export filter`. The merged PDF itself is produced by pdf-lib, and encrypted inputs fail earlier in the merge flow with `PASSWORD_REQUIRED`, so no encryption is bypassed.
- Convert pairs from `.pdf` to `docx`, `odt` or `rtf` pass `PDF_INTO_WRITER_INFILTER`, and to `pptx` pass `PDF_INTO_IMPRESS_INFILTER` (`impress_pdf_import`), via `sofficeInfilterForConvert` in `utils/processors/conversionProcessor.js`, so LibreOffice loads the PDF into the module that owns the target export filter (Writer: `Office Open XML Text`, `writer8`, `Rich Text Format`; Impress: `Impress Office Open XML`); the default Draw import has none of those filters. The remaining declared pairs stay failing with `no export filter` on this build: `.pdf` to `xlsx` (no Calc PDF import filter is registered) and the cross-module `.docx` to `pptx` / `.pptx` to `docx` (a Writer model cannot store through an Impress filter and vice versa).

---

##  API Reference

### `POST /process`
Main entry point for file processing.
- **Content-Type**: `multipart/form-data`
- **Files**: `files` (up to 200, the field the UI sends) or `file` (up to 10). Both field names are merged into one list, and `merge` needs two or more files in that list, not a particular field name. 50MB per file.
- **Fields**: `operation`, default `unlock`, one of `unlock`, `convert`, `merge`, `split`, `ocr`, `rotate`, `compress`, `repair`, `protect`, `watermark`, `pagenumbers`, `organize`. `targetFormat` is required for `convert` and selects the merge output format (`pdf` or `docx`). Also read: `pageRanges` (split), `rotationAngle` and `pages` (rotate), `organizePages` (organize). See `README.md` for the full request field list.
- **Returns**: `status`, `message`, `results[]` of `{downloadId, downloadName, downloadUrl, detectedType, message}`, `downloadId`/`downloadUrl` for the first result only, and `batchDownloadId`/`batchDownloadUrl` when more than one output was produced. Errors return `{status, message, reason, code}`.

### `GET /download/:id`
Retrieves a processed file.
- **Param**: `id` - The unique ID returned by `/process`.
- **Behavior**: Streams the file to the browser and deletes it from storage immediately after completion.

### `GET /health`
Sanity check to confirm service availability.

---

##  Security Logic

1. **Encryption & DRM Policy**: The app explicitly checks for encryption signatures (like OLE headers or ZIP password flags) and aborts if the file is truly encrypted, informing the user that the original password is required. The Office, XLSX and ZIP repair paths carry that check unchanged, and the PDF repair path maps a qpdf password refusal to `PASSWORD_REQUIRED` 400 with `SECURE_ENCRYPTION_MESSAGE`, never `FILE_CORRUPTED`, as the unlock path does.
2. **Path Sanitization**: No uploaded path is ever used. Output files are written flat into the server's output directory, and the per-job work directory is named by `randomUUID()`. A user-supplied filename only reaches a path through `sanitizeBaseName` (`utils/processors/router.js`), which replaces every run of characters outside `[A-Za-z0-9_.-]` with `_` and strips leading and trailing underscores. That whitelist drops `/` and `\`, and the result is always appended to a server-chosen base name, so no filename can introduce a directory and directory traversal is not possible.
3. **Execution Guard**: The server never launches an upload as a program or script. `qpdf` is not a macro host, and the parsing paths stay in process, where jszip, mammoth, exceljs, sharp, pdf-lib and yauzl read the upload's structure and bytes. The exception is the conversion path: `convertWithLibreOffice` passes the uploaded path to `soffice --headless --convert-to` (`utils/processors/conversionProcessor.js:29-43`), which `convert` reaches for PDF, DOCX, PPTX and XLSX input and `merge` reaches for non-PDF, non-image input (`utils/processors/router.js:168`, `:209`). Nothing in this repository sets a LibreOffice macro security level. Each conversion runs against its own `-env:UserInstallation` profile under the OS temp directory (`utils/helpers/libreOfficeProfile.js`), which separates concurrent conversions but is a fresh default profile, not a hardened one, so on that path an upload that carries macros is opened by LibreOffice under whatever the installed LibreOffice defaults to, and no macro-execution guarantee is made here.
4. **Auto-Cleanup**: Temporary uploads are deleted immediately after processing. Outputs are deleted as soon as they are downloaded, or otherwise at 30 minutes, reaped by a 5-minute sweep.

---

##  Technical Requirements

- **Node.js**: 18.17+ for `dev`, `build` and `start`, set by `sharp`, a root runtime dependency imported by `utils/processors/imageProcessor.js` (`engines: ^18.17.0 || ^20.3.0 || >=21.0.0`). Vite 5 is looser (`^18.0.0 || >=20.0.0`) and does not set it. `npm test` needs Node 21+, because the test script passes `tests/**/*.test.js` as its final argument and `node --test` only treats that argument as a glob from Node 21. No manifest in this repository declares an `engines` field, so npm does not enforce any of this.
- **System Binaries**: `qpdf` and `soffice` (LibreOffice) must be on `PATH`, or their locations must be exported into the server process environment as `QPDF_BIN` and `LIBREOFFICE_BIN` before start. `server/src/config.js` reads bare `process.env` and nothing loads `server/.env`, so the file `setup.bat` copies from `.env.example` currently has no effect.
