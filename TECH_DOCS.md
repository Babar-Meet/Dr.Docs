# Dr.Docs - Technical Documentation

## Overview
**Dr.Docs** is a specialized web application designed for students and faculty to securely unlock, convert, merge, split, rotate, compress, and OCR files. It is built as a monorepo (npm workspaces `client` and `server`) with a React frontend and an Express backend, using a modular processor system to handle various file formats.

---

##  Architecture

### 1. Monorepo Structure
- `/client`: React frontend (Vite + TailwindCSS)
- `/server`: Express backend (Node.js)
- `/utils`: Common processing logic, helpers, and constants. Not an npm workspace; the server imports it by relative path.

### 2. File Processing Pipeline
The processing flow is managed by a centralized router (`/utils/processors/router.js`) which:
1. Validates the file extension and declared MIME type. Magic-byte signature checks for encryption happen later, inside the processors; XLSX is the exception, matched by ExcelJS error text instead of a header check.
2. Identifies the requested mode (`unlock`, `convert`, `merge`, `split`, `ocr`, `rotate`, `compress`), rejecting anything else with 400 `UNSUPPORTED_FILE`.
3. Dispatches the task to the specific file processor (PDF, Office, Image, etc.).
4. Returns one output descriptor per generated file.

After the router returns, `processService.processUploadedFile` deletes the uploaded originals and the per-job work directory in a `finally` block (`server/src/services/processService.js:151-163`). Outputs are not touched there; they are removed when downloaded, or by the TTL sweep.

---

##  Key Components

###  Backend (Express)
- **`multer`**: Handles multipart/form-data uploads.
- **`AsyncTaskQueue`**: An in-memory FIFO queue that runs at most 2 high-resource tasks (like LibreOffice conversions) at a time, so concurrent hits never put more than 2 LibreOffice or qpdf processes in flight.
- **`downloadStore`**: Manages the mapping of unique IDs to generated files, allowing users to securely download their processed results via a single-use ID.

###  Frontend (React)
- **Drag-and-Drop**: Built using native HTML5 drag-and-drop combined with a clean UI.
- **Vite Proxy**: Configured to proxy API requests from `:5173` to `:5000` for development.

###  Processor Modules
- **qpdf**: Used for removing PDF restrictions.
- **LibreOffice (soffice)**: Powers the heavy-lifting conversions (e.g., DOCX to PDF).
- **jszip**: Reads and rewrites Word and PowerPoint OOXML to strip editing protections (`w:documentProtection` and `w:writeProtection` in `word/settings.xml`, `p:modifyVerifier` and `p:writeProtection` in `ppt/*.xml`). **mammoth**: parses the DOCX package, `word/document.xml` included, but never rewrites OOXML. In the unlock path it is a DOCX readability probe whose result is discarded; it exists only to map parser password errors to `PASSWORD_REQUIRED`. In the OCR path it extracts DOCX text.
- **exceljs**: Modifies spreadsheet sheet protection flags.
- **sharp**: Decodes images, applies `.rotate()` for EXIF orientation, and re-encodes to jpg, png, webp, avif or tiff. **pdf-lib**: Embeds images into PDFs for image-to-PDF, via `PDFDocument.embedPng`/`embedJpg`, and performs PDF merge, split and rotate plus the `PDFDocument.load` that detects encryption and corruption.

---

##  API Reference

### `POST /process`
Main entry point for file processing.
- **Content-Type**: `multipart/form-data`
- **Files**: `files` (up to 200, the field the UI sends) or `file` (up to 10). Both field names are merged into one list, and `merge` needs two or more files in that list, not a particular field name. 50MB per file.
- **Fields**: `operation`, default `unlock`, one of `unlock`, `convert`, `merge`, `split`, `ocr`, `rotate`, `compress`. `targetFormat` is required for `convert` and selects the merge output format (`pdf` or `docx`). Also read: `pageRanges` (split), `rotationAngle` and `pages` (rotate). See `README.md` for the full request field list.
- **Returns**: `status`, `message`, `results[]` of `{downloadId, downloadName, downloadUrl, detectedType, message}`, `downloadId`/`downloadUrl` for the first result only, and `batchDownloadId`/`batchDownloadUrl` when more than one output was produced. Errors return `{status, message, reason, code}`.

### `GET /download/:id`
Retrieves a processed file.
- **Param**: `id` - The unique ID returned by `/process`.
- **Behavior**: Streams the file to the browser and deletes it from storage immediately after completion.

### `GET /health`
Sanity check to confirm service availability.

---

##  Security Logic

1. **Encryption & DRM Policy**: The app explicitly checks for encryption signatures (like OLE headers or ZIP password flags) and aborts if the file is truly encrypted, informing the user that the original password is required.
2. **Path Sanitization**: No uploaded path is ever used. Output files are written flat into the server's output directory, and the per-job work directory is named by `randomUUID()`. A user-supplied filename only reaches a path through `sanitizeBaseName` (`utils/processors/router.js`), which replaces every run of characters outside `[A-Za-z0-9_.-]` with `_` and strips leading and trailing underscores. That whitelist drops `/` and `\`, and the result is always appended to a server-chosen base name, so no filename can introduce a directory and directory traversal is not possible.
3. **Execution Guard**: The server never launches an upload as a program or script. `qpdf` is not a macro host, and the parsing paths stay in process, where jszip, mammoth, exceljs, sharp, pdf-lib and yauzl read the upload's structure and bytes. The exception is the conversion path: `convertWithLibreOffice` passes the uploaded path to `soffice --headless --convert-to` (`utils/processors/conversionProcessor.js:26-37`), which `convert` reaches for PDF, DOCX, PPTX and XLSX input and `merge` reaches for non-PDF, non-image input (`utils/processors/router.js:127`, `:168`). Nothing in this repository sets a LibreOffice macro security level or supplies a locked-down user profile, so on that path an upload that carries macros is opened by LibreOffice under whatever the installed LibreOffice defaults to, and no macro-execution guarantee is made here.
4. **Auto-Cleanup**: Temporary uploads are deleted immediately after processing. Outputs are deleted as soon as they are downloaded, or otherwise at 30 minutes, reaped by a 5-minute sweep.

---

##  Technical Requirements

- **Node.js**: 18.17+ for `dev`, `build` and `start`, set by `sharp`, a root runtime dependency imported by `utils/processors/imageProcessor.js` (`engines: ^18.17.0 || ^20.3.0 || >=21.0.0`). Vite 5 is looser (`^18.0.0 || >=20.0.0`) and does not set it. `npm test` needs Node 21+, because the test script passes `tests/**/*.test.js` as its final argument and `node --test` only treats that argument as a glob from Node 21. No manifest in this repository declares an `engines` field, so npm does not enforce any of this.
- **System Binaries**: `qpdf` and `soffice` (LibreOffice) must be on `PATH`, or their locations must be exported into the server process environment as `QPDF_BIN` and `LIBREOFFICE_BIN` before start. `server/src/config.js` reads bare `process.env` and nothing loads `server/.env`, so the file `setup.bat` copies from `.env.example` currently has no effect.
