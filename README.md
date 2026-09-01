# Dr.Docs

Free, fast and private toolkit for everyday documents. Handle PDFs and Office files in your browser - no signup, no hassle. Unlock restrictions, convert formats, merge/split, rotate, compress and extract text - all while rejecting encrypted/DRM content.

> Hard is good - this README stays thorough but stays current. TL;DR: `setup.bat` -> `start.bat` -> open `http://localhost:5173`.

---

## Table of Contents
- [Purpose](#purpose)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [APIs](#apis)
- [Security](#security)
- [Installation](#installation)
- [Running](#running)
- [Testing](#testing)
- [Configuration](#configuration)
- [Dependencies](#dependencies)
- [License](#license)

---

## Purpose

Office files often carry removable restrictions (read-only, sheet protection) and PDFs carry owner-password limits that block editing. Batch converting Office <-> PDF <-> images is painful to set up per machine.

Dr.Docs gives one web UI to:
- Strip **removable** restrictions (not strong encryption)
- Convert, merge, split, rotate, compress and OCR
- Never bypass password/DRM - those always fail with `This file is securely encrypted and requires the original password.`

Audience: students/faculty who get locked files and need to batch-process quickly.

---

## Features

- **Unlock** - DOCX/PPTX: strip `w:documentProtection`/`w:writeProtection`/`p:modifyVerifier`; XLSX: delete `sheetProtection`; PDF: `qpdf --decrypt`; ZIP: rebuild without encrypted entries.
- **Convert** - Office via LibreOffice `soffice --headless --convert-to`; images via `sharp` (jpg/png/webp/avif/tiff/pdf).
- **Merge** - PDF/DOCX/PPTX/XLSX/JPG/PNG -> PDF or DOCX (non-PDF auto-converted to PDF first, then `pdf-lib` merge).
- **Split** - PDF by ranges `1-3,5,7-10` or each page individually via `pdf-lib`.
- **Rotate** - PDF pages `90/180/270`, `all` or `1,3-5,8` via `pdf-lib`.
- **Compress** - PDF lossless via `qpdf --linearize --object-streams=generate --stream-data=compress` (text 10-40%, scans 5-10%).
- **OCR / Extract** - PDF `pdf-parse`, DOCX `mammoth`, XLSX `ExcelJS`, PPTX `a:t` parse, images `Tesseract.js` -> `.txt`.
- **Batch + Hardening** - Up to 200 files, per-file downloads + batch ZIP, `AsyncTaskQueue(2)` limits LibreOffice/qpdf, 384 backend tests (TAP English), `Docs/` fixtures survive `Temp/` wipe.

---

## Tech Stack

| Category | Tech |
|---|---|
| Runtime | Node.js 18+ (tested 20, 24) |
| Frontend | React 18, Vite 5, Tailwind 3, PostCSS, lucide-react, React Router 6 |
| Backend | Express 4, multer 2, cors, fs-extra, mime-types |
| PDF | qpdf (binary), pdf-lib, pdf-parse |
| Office | LibreOffice `soffice`, mammoth, exceljs, jszip, yauzl |
| Image | sharp |
| OCR | tesseract.js |
| Archive | archiver, unzipper, yauzl |
| Test | node:test + node:assert/strict --test-reporter=tap (384, no UI tests) |
| Dev | nodemon, concurrently |

---

## Project Structure

```
Dr.Docs/
|-- AGENTS.md                    # agent workflow (not gitignored)
|-- README.md                    # this file
|-- TECH_DOCS.md                 # deep technical reference
|-- package.json                 # root workspaces [client,server], sharp, concurrently
|-- package-lock.json
|-- setup.bat / start.bat        # Windows quickstart
|-- .gitignore                   # node_modules, client/dist, server/tmp, Temp/, Docs/, .env, *.log
|-- client/                      # React SPA (Vite :5173)
|   |-- src/
|   |   |-- App.jsx              # all 7 tools UI (no split), drag-drop, format picker
|   |   |-- main.jsx             # BrowserRouter wrapper
|   |   -- index.css
|   |-- index.html               # <title>Dr.Docs</title>
|   |-- vite.config.js           # proxy /process,/download,/health -> :5000
|   |-- tailwind.config.js       # tide/lagoon/foam/coral/sand/ink
|   -- package.json              # dr-docs-client
|-- server/                      # Express API (:5000)
|   |-- src/
|   |   |-- index.js             # health, static client/dist, errorHandler
|   |   |-- config.js            # TMP_ROOT, UPLOAD_DIR, OUTPUT_DIR, WORK_DIR, PORT, QPDF_BIN, LIBREOFFICE_BIN
|   |   |-- middleware/upload.js # multer disk storage, fileFilter isAllowedUpload, 50MB
|   |   |-- middleware/errorHandler.js
|   |   |-- routes/files.js      # POST /process, GET /download/:id
|   |   -- services/
|   |       |-- processService.js
|   |       |-- downloadStore.js # Map + TTL 30m, sweep 5m, single-use
|   |       -- asyncQueue.js     # concurrency 2
|   |-- tmp/                     # runtime (gitignored): uploads, outputs, work
|   -- package.json              # dr-docs-server
|-- utils/                       # shared, not a workspace, imported via ../../../utils/
|   |-- constants.js             # MIME_BY_EXTENSION, CONVERSION_TARGETS, OPERATION_MODES (7), SECURE_ENCRYPTION_MESSAGE plain English
|   |-- errors.js                # AppError(code,status,details)
|   |-- helpers/
|   |   |-- command.js           # spawn + timeout SIGTERM (4m for soffice)
|   |   |-- fileType.js          # detect, isAllowedUpload, isValidOperation/Conversion
|   |   |-- fs.js                # safeUnlink/safeRemoveDir no-throw
|   |   -- office.js             # isOleCompoundBuffer, validateOfficePackage, removeDocProps
|   -- processors/
|       |-- router.js            # sole dispatch
|       |-- pdfProcessor.js
|       |-- officeProcessor.js
|       |-- excelProcessor.js
|       |-- imageProcessor.js
|       |-- zipProcessor.js
|       |-- conversionProcessor.js
|       |-- mergeSplitProcessor.js
|       |-- ocrProcessor.js
|       |-- rotateProcessor.js   # pdf-lib rotate
|       -- (compress via pdfProcessor)
|-- tests/                       # backend only, 384 TAP, no UI (volatile)
|   |-- utils/helpers/fileType.test.js, office.test.js, command.test.js, fs.test.js
|   |-- utils/processors/router.test.js, pdf/office/excel/zip/image/mergeSplit/ocr/conversion.test.js
|   |-- server/services/asyncQueue.test.js, downloadStore.test.js
|   |-- server/middleware/upload.test.js, errorHandler.test.js
|   -- security/noSecrets.test.js, gitSafe.test.js
|-- Docs/                        # persistent fixtures (gitignored), survives Temp wipe
|   |-- pdf/ (sample-1page.pdf, 5pages, 10pages, rotate-all) + locked/enc.pdf,corrupt.pdf
|   |-- docx/ + protected/sample-protected.docx
|   |-- pptx/
|   |-- xlsx/ + protected/sample-protected.xlsx
|   |-- images/ zip/ other/
|   |-- README.md
|   -- generate_examples.mjs     # creates logical Docs/* via pdf-lib/ExcelJS/JSZip/sharp
-- Temp/                        # scratch, gitignored, safe to rm -rf
    -- .gitkeep
```

Key: `client/` = SPA, `server/` = API, `utils/` = processors (router is entry), `tests/` = logic only, `Docs/` = fixtures (not committed), `Temp/` = scratch.

---

## Architecture

```
Browser (Vite :5173)  -->  Express :5000
  drag-drop FormData      multer (uuid names, 50MB, MIME check)
  POST /process           -> AsyncTaskQueue(2) -> processService -> router -> processor -> downloadStore (Map, UUID) -> JSON {results, batchUrl}
  GET /download/:id       -> stream + delete record (single-use) + sweep every 5m

Frontend state: useState only. Backend state: in-memory Map + queue. No DB.
```

Flow: upload -> multer uuid -> queue (2 concurrent) -> `router.processFile({operation,targetFormat,pageRanges,rotationAngle,pages,inputFiles,outputBasePath,workDir,qpdfBin,libreOfficeBin})` -> processor writes `server/tmp/outputs/<id>_<idx>_<name>.ext` -> register UUID -> respond -> frontend shows per-file + Download All -> `GET /download/:id` streams and deletes.

---

## APIs

### `POST /process`
`multipart/form-data`
- `operation` default `unlock`: `unlock|convert|merge|split|ocr|rotate|compress`
- `targetFormat` for `convert` (e.g. `pdf`) and `merge` (`pdf|docx`)
- `pageRanges` for `split` e.g. `1-3,5,7-10`
- `rotationAngle` for `rotate`: `90|180|270`
- `pages` for `rotate`: `all` or `1,3-5,8`
- `files` (200 max) and `file` (10 max) merged, 50MB each

Success 200:
```json
{
  "status": "success",
  "message": "Processed 2 file(s) successfully.",
  "results": [{"downloadId":"uuid","downloadName":"sample_processed.pdf","downloadUrl":"/download/uuid","detectedType":"PDF","message":"..."}],
  "batchDownloadId": "uuid","batchDownloadUrl":"/download/uuid"
}
```
Error 4xx/5xx:
```json
{"status":"failed","message":"Password required","reason":"This file is securely encrypted and requires the original password.","code":"PASSWORD_REQUIRED"}
```
Codes: `PASSWORD_REQUIRED` 400 (OLE, yauzl 0x1, qpdf), `UNSUPPORTED_FILE` 400, `FILE_CORRUPTED` 400, `FILE_TOO_LARGE` 400, `PROCESSING_FAILED` 500.

### `GET /download/:id`
UUID from `/process`. Streams file, then deletes record+file. 404 if unknown/expired. TTL 30m, sweep 5m.

### `GET /health`
`{"status":"ok","service":"dr-docs"}` Always 200. Root `/` same when no `client/dist`.

---

## Security

- **No bypass:** OLE header `d0 cf 11 e0 a1 b1 1a e1` (Office), yauzl `generalPurposeBitFlag & 0x1` (ZIP), qpdf stderr `password` (PDF) -> `PASSWORD_REQUIRED`.
- **Validate:** extension + MIME vs `MIME_BY_EXTENSION`, `application/octet-stream` allowed as fallback.
- **Isolate:** uploads `Date.now()-uuid.ext` in `UPLOAD_DIR`, outputs uuid dirs, no user path use, never execute uploads.
- **Clean:** uploads deleted in `finally`, outputs deleted after download or sweep.

Tests in `tests/security/` enforce this + gitignore (`Temp/ Docs/ server/tmp/ client/dist/ .env eng.traineddata`).

---

## Installation

Prereqs: Node 18+ (20/24 ok), npm 10+, `qpdf` and `soffice` (LibreOffice) on PATH.

Windows (Chocolatey):
```powershell
choco install qpdf libreoffice-fresh -y
```
macOS: `brew install qpdf; brew install --cask libreoffice`  
Ubuntu: `sudo apt-get install -y qpdf libreoffice`

```bash
npm install              # or npm run bootstrap (installs workspaces)
cp server/.env.example server/.env  # optional: PORT=5000 QPDF_BIN=qpdf LIBREOFFICE_BIN=soffice
```

Quickstart Windows:
```powershell
setup.bat  # install + .env + check binaries
start.bat  # build + dev (http://localhost:5173)
```

---

## Running

```bash
npm run dev              # server :5000 (nodemon) + client :5173 (Vite, proxied)
npm run build -w client  # -> client/dist
npm run start -w server  # serves dist + API on same port
```

Dev: `http://localhost:5173` hot reload, API proxy. Prod: build then start.

---

## Testing

Backend only (UI volatile, not tested). TAP English, no emoji, no box-drawing so no mojibake on Windows.

```bash
npm test                 # node --test --test-reporter=tap tests/**/*.test.js (384, 0 fail)
npm run test:watch       # watch mode
```

Coverage: helpers (fileType, office, command timeout SIGTERM, fs no-throw), processors (router 7 modes, pdf/office/excel/zip/image/mergeSplit/ocr/conversion with PASSWORD_REQUIRED, FILE_CORRUPTED, double-click idempotent), services (asyncQueue concurrency 2 FIFO, downloadStore TTL), middleware (upload fileFilter, errorHandler), security (noSecrets, gitSafe).

`npm run build -w client` must stay green before stage.

Fixtures: `Docs/` (gitignored, persistent) logical `pdf/locked`, `docx/protected` etc. Regenerate: `node Docs/generate_examples.mjs`. `Temp/` is scratch, safe to delete.

---

## Configuration

`server/src/config.js` computes `SERVER_ROOT/tmp/{uploads,outputs,work}`, reads env:

| Var | Default | Purpose |
|---|---|---|
| `PORT` | 5000 | Express port |
| `QPDF_BIN` | `qpdf` | qpdf binary |
| `LIBREOFFICE_BIN` | `soffice` | soffice binary |

`CLEANUP_INTERVAL_MS` 5m, `DOWNLOAD_TTL_MS` 30m, `ensureRuntimeDirectories()` on startup.

`client/vite.config.js` proxy `/process,/download,/health -> :5000`. Tailwind custom `tide/lagoon/foam/coral/sand/ink`, fonts `Space Grotesk/Manrope`.

`utils/constants.js` is single source: `MIME_BY_EXTENSION`, `SUPPORTED_EXTENSIONS`, `FILE_KIND_BY_EXTENSION`, `CONVERSION_TARGETS`, `OPERATION_MODES`, `MAX_UPLOAD_SIZE_BYTES` 50MB, `SECURE_ENCRYPTION_MESSAGE`.

---

## Dependencies

Server: `express`, `cors`, `multer`, `fs-extra`, `sharp`, `pdf-lib`, `pdf-parse`, `mammoth`, `exceljs`, `jszip`, `archiver`, `yauzl`, `tesseract.js`, `mime-types`, `nodemon` dev.  
Client: `react`, `react-dom`, `react-router-dom`, `lucide-react`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `postcss`, `autoprefixer`.

Internal: `server/src/routes/files.js -> upload, asyncQueue, processService, downloadStore`; `processService -> router, config, fs`; `router -> helpers/fileType, processors/*`.

---

## License

Copyright (c) 2026 Babariya Meet. All rights reserved. No permission to use, copy, modify or distribute without prior written permission.
