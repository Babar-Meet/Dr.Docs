# Dr.Docs

Local toolkit for everyday documents: it runs on your own machine and handles PDFs, Office files, images and ZIP archives. It removes removable restrictions, converts formats, merges, splits, rotates, compresses and extracts text, and never bypasses a password or DRM. No third-party service receives your documents: files are written under `server/tmp/` and deleted after download or by a 30 minute sweep. The product does make two outbound requests, and neither one carries a document: every page load asks Google Fonts for the Inter and JetBrains Mono stylesheets, and the first image OCR downloads the Tesseract `eng` language model from the public jsDelivr CDN and caches it. Both are listed under [Security](#security). No signup, no account, nothing to pay. Use is restricted: see [License](#license).

> Hard is good. Facts here are checked against `package.json`, `setup.bat`, `start.bat`, `server/src/config.js` and `utils/constants.js`. TL;DR: install `qpdf` and LibreOffice, then `npm install` and `npm run dev`, then open `http://localhost:5173`. On Windows, `setup.bat` then `start.bat` does the same thing.

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
- **Convert** - Office via LibreOffice `soffice --headless --convert-to`; JPG/PNG/JPEG in, JPG/PNG/WEBP/AVIF/TIFF out via `sharp`; image-to-PDF via `pdf-lib`.
- **Merge** - PDF/DOCX/PPTX/XLSX/JPG/PNG -> PDF or DOCX (non-PDF auto-converted to PDF first, then `pdf-lib` merge).
- **Split** - PDF by ranges `1-3,5,7-10` or each page individually via `pdf-lib`.
- **Rotate** - PDF pages `90/180/270`, `all` or `1,3-5,8` via `pdf-lib`.
- **Compress** - PDF lossless via `qpdf --linearize --object-streams=generate --stream-data=compress` (linearised, object streams, compressed streams). Output size depends on the source file.
- **OCR / Extract** - PDF `pdf-parse`, DOCX `mammoth`, XLSX `ExcelJS`, PPTX `a:t` parse, images `Tesseract.js` -> `.txt`.
- **Batch + Hardening** - Up to 200 files, per-file downloads + batch ZIP, `AsyncTaskQueue(2)` limits LibreOffice/qpdf, 384 backend tests (TAP English), `Docs/` fixtures survive `Temp/` wipe.

Accepted uploads: `pdf`, `docx`, `pptx`, `xlsx`, `jpg`, `jpeg`, `png`, `zip`, 50MB per file. Each tool takes a different subset:

| Tool | Accepts | Notes |
|---|---|---|
| Unlock | PDF, DOCX, PPTX, XLSX, ZIP | ZIP is rebuilt without encrypted entries |
| Convert | PDF, DOCX, PPTX, XLSX, JPG, JPEG, PNG | no ZIP; targets per type, see `CONVERSION_TARGETS` |
| Merge | 2 or more, PDF, DOCX, PPTX, XLSX, JPG, JPEG, PNG | no ZIP; output is PDF or DOCX |
| Split | exactly 1 PDF | page ranges like `1-3,5,7-10` |
| Rotate | exactly 1 PDF | angle 90, 180 or 270, all pages or `1,3-5,8` |
| Compress | 1 or more PDF | lossless, output size depends on the source file |
| OCR / text | PDF, DOCX, PPTX, XLSX, JPG, JPEG, PNG | no ZIP; output is `.txt` |

`webp`, `avif` and `tiff` are conversion outputs only. They are rejected as uploads.

---

## Tech Stack

| Category | Tech |
|---|---|
| Runtime | Node.js 21+ for `npm test` (its script passes an unquoted glob to `node --test`, which needs Node 21+); 18.17+ for `dev`, `build` and `start`, set by `sharp` (a runtime dependency). No `engines` field declared |
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
|   |-- tailwind.config.js       # ink/deep/panel/elevated/borderDark/borderStrong/offWhite/muted/orange* + success/warning/error/info Bg/Text pairs, all var(--x)
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
|   |-- errors.js                # AppError(message, code="PROCESSING_FAILED", statusCode=500, details={})
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
|-- Docs/                        # local fixtures, untracked (gitignored), survives Temp wipe
|   |-- pdf/ (sample-1page.pdf, 5pages, 10pages, rotate-all) + locked/enc.pdf,corrupt.pdf
|   |-- docx/ + protected/sample-protected.docx
|   |-- pptx/
|   |-- xlsx/ + protected/sample-protected.xlsx
|   |-- images/ zip/ other/
|   |-- README.md
|   -- generate_examples.mjs     # flat sample-* files into Docs/ via pdf-lib/ExcelJS/JSZip/sharp, plus examples_manifest.md at repo root; no pdf/locked/*
-- Temp/                        # scratch, gitignored, safe to rm -rf
    -- .gitkeep
```

Key: `client/` = SPA, `server/` = API, `utils/` = processors (router is entry), `tests/` = logic only, `Docs/` = fixtures (not committed), `Temp/` = scratch.

---

## Architecture

```
Browser (Vite :5173)  -->  Express :5000
  drag-drop FormData      multer (uuid names, 50MB, MIME check)
  POST /process           -> AsyncTaskQueue(2) -> processService -> router -> processor -> downloadStore (Map, UUID) -> JSON {results, downloadUrl, batchDownloadUrl}
  GET /download/:id       -> stream + delete record (single-use) + sweep every 5m

Frontend state: useState only. Backend state: in-memory Map + queue. No DB.
```

Flow: upload -> multer uuid -> queue (2 concurrent) -> `router.processFile({operation,targetFormat,pageRanges,rotationAngle,pages,inputFiles,outputBasePath,workDir,qpdfBin,libreOfficeBin})` -> processor writes `server/tmp/outputs/<id>_<idx>_<name>.ext` for unlock, convert, ocr, rotate and compress, `outputs/<id>.pdf` for merge, and `outputs/<prefix>_part_<n>_page_<x>.pdf` (or `_part_<n>_pages_<a>-<b>.pdf` for a multi-page range) for split -> register UUID -> respond -> frontend shows per-file + Download All -> `GET /download/:id` streams and deletes.

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

Success 200, single input file:
```json
{
  "status": "success",
  "message": "Processed 1 file(s) successfully.",
  "results": [{"downloadId":"uuid","downloadName":"sample_processed.pdf","downloadUrl":"/download/uuid","detectedType":"PDF","message":"Restrictions removed from PDF."}],
  "downloadId": "uuid",
  "downloadName": "sample_processed.pdf",
  "downloadUrl": "/download/uuid",
  "batchDownloadId": null,
  "batchDownloadName": null,
  "batchDownloadUrl": null
}
```
The batch fields are non-null only when there is more than one output; then `batchDownloadName` is `<operation>_all_processed.zip`.

Error 4xx/5xx:
```json
{"status":"failed","message":"This file is securely encrypted and requires the original password.","reason":"Password required","code":"PASSWORD_REQUIRED"}
```
Codes: `PASSWORD_REQUIRED` 400 (OLE, yauzl 0x1, qpdf), `UNSUPPORTED_FILE` 400, `FILE_CORRUPTED` 400, `FILE_TOO_LARGE` 400, `PROCESSING_FAILED` 500 and 404 (unknown non-GET route when a `client/dist` build is present, unknown or expired download id).

### `GET /download/:id`
UUID from `/process`. Streams file, then deletes record+file. 404 if unknown/expired. TTL 30m, sweep 5m.

### `GET /health`
`{"status":"ok","service":"dr-docs"}` Always 200. Root `/` same when no `client/dist`.

---

## Security

- **No bypass:** OLE header `d0 cf 11 e0 a1 b1 1a e1` (Office), yauzl `generalPurposeBitFlag & 0x1` (ZIP), qpdf stderr `password` (PDF) -> `PASSWORD_REQUIRED`.
- **Validate:** extension + MIME vs `MIME_BY_EXTENSION`, `application/octet-stream` allowed as fallback.
- **Isolate:** uploads `Date.now()-uuid.ext` in `UPLOAD_DIR`, outputs flat files in `OUTPUT_DIR` with no per-job directory (split parts use a sanitized filename prefix and carry no uuid), no user path use. Nothing launches an upload as a program or script, with one exception: `convert` hands the uploaded path to `soffice --headless --convert-to` for PDF, DOCX, PPTX and XLSX input, and `merge` does the same for non-PDF, non-image input (`utils/processors/conversionProcessor.js:26-37`, reached from `utils/processors/router.js:127` and `:168`), which opens the document in LibreOffice. This repository sets no LibreOffice macro security level and supplies no locked-down user profile, so no macro-execution guarantee is made on that path.
- **Clean:** uploads deleted in `finally`, outputs deleted after download or sweep.
- **Network:** two outbound requests, neither carrying a document.
  1. Font stylesheet, every page load in dev and prod: `client/src/index.css:1` is `@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap")`, and Vite keeps it at the top of the built bundle (`client/dist/assets/index-y9ft1sBA.css`). Google sees the visitor's IP address and User-Agent. No document.
  2. Tesseract `eng` model, first image OCR only: `createWorker("eng")` at `utils/processors/ocrProcessor.js:36` passes no `langPath`, so tesseract.js fetches `https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz` (`node_modules/tesseract.js/src/worker-script/index.js:129`, `:140-141`) and writes `eng.traineddata` to disk (`:180`). The cache is read first (`:111`), so the download happens once per cache location, which is the server's working directory because `cachePath` is unset. No document: the URL is built from `lang` alone, and the image is passed to `worker.recognize(inputPath)` in process.

  Nothing else in `client/src`, `server/src` or `utils` reaches the network: the only other remote strings are XML namespace URIs (`utils/helpers/office.js:7,17,24`), the localhost dev proxy (`client/vite.config.js:9-11`), a hint string (`server/src/index.js:55`), and `https://reactjs.org` inside a React error message. No telemetry, analytics, cookies or tracking code.

Tests in `tests/security/` enforce this + gitignore (`Temp/ Docs/ server/tmp/ client/dist/ .env eng.traineddata`).

---

## Installation

Prereqs: Node.js 18.17+ for `dev`, `build` and `start` (the floor comes from `sharp`, a runtime dependency, not Vite), Node.js 21+ for `npm test` (its script passes an unquoted glob as the final argument, which `node --test` accepts from Node 21), `qpdf` and `soffice` (LibreOffice) on PATH. No `engines` field is declared in any manifest.

Without `qpdf`: PDF unlock and PDF compress fail. Without `soffice`: every LibreOffice conversion fails, which is every conversion except image-to-PDF and image-to-image, plus every merge with a DOCX, PPTX or XLSX input, and every merge exported to DOCX. Split, rotate, image conversion, a PDF-output merge whose inputs are all PDF or images, and ZIP unlock keep working.

Windows (Chocolatey):
```powershell
choco install qpdf libreoffice-fresh -y
```
macOS: `brew install qpdf; brew install --cask libreoffice`  
Ubuntu: `sudo apt-get install -y qpdf libreoffice`

```bash
npm install              # installs root + client + server
```

`npm run bootstrap` is `npm install --workspaces`: client and server only, with the root project skipped, so it does not install `concurrently` (needed by `npm run dev`) or `sharp` (needed at runtime by `utils/processors/imageProcessor.js`). Run `npm install` at least once before `npm run dev`.

`PORT`, `QPDF_BIN` and `LIBREOFFICE_BIN` are read from the process environment. Nothing loads `server/.env`: there is no dotenv dependency, no `--env-file` flag and no `process.loadEnvFile` call, so copying `server/.env.example` to `server/.env` has no effect. Set them in the shell that starts the server: `PORT=5000 npm run dev` in sh or bash, `$env:PORT=5000; npm run dev` in PowerShell, `set PORT=5000 && npm run dev` in cmd.exe.

Quickstart Windows:
```powershell
setup.bat  # npm install + copy server/.env (unused) + check qpdf and soffice; both scripts pause before closing
start.bat  # build + dev (http://localhost:5173)
```

`setup.bat` prints that conversions may fail unless `LIBREOFFICE_BIN` is set in `server/.env`. Nothing loads that file, so do not spend time on it: put `qpdf` and `soffice` on PATH, or set `LIBREOFFICE_BIN` in the shell that starts the server.

---

## Running

```bash
npm run dev              # server :5000 (nodemon) + client :5173 (Vite, proxied)
npm run build -w client  # -> client/dist
npm run start -w server  # serves dist + API on same port
```

Dev: `npm run dev`, then open `http://localhost:5173` (hot reload, API proxied to port 5000). Prod: `npm run build -w client`, then `npm run start -w server`, then open `http://localhost:5000`; port 5173 belongs to the Vite dev server only.

---

## Testing

Backend only (UI volatile, not tested). TAP English, no emoji, no box-drawing so no mojibake on Windows.

```bash
npm test                 # node --test --test-reporter=tap tests/**/*.test.js (384, 0 fail)
npm run test:watch       # watch mode
```

Coverage: helpers (fileType, office, command timeout SIGTERM, fs no-throw), processors (router 7 modes, pdf/office/excel/zip/image/mergeSplit/ocr/conversion with PASSWORD_REQUIRED, FILE_CORRUPTED, double-click idempotent), services (asyncQueue concurrency 2 FIFO, downloadStore TTL), middleware (upload fileFilter, errorHandler), security (noSecrets, gitSafe).

`npm run build -w client` must stay green before stage.

Fixtures: `Docs/` is local only and untracked (gitignored), so git never commits it and cannot restore it either. Back it up separately if you need it. It holds `pdf/locked`, `docx/protected` etc. `node Docs/generate_examples.mjs` writes flat `sample-*` files into `Docs/` plus `examples_manifest.md` at the repo root; it creates no `pdf/locked/*`, no `sample-rotate-all.pdf` and no `*_loose.pdf`, so it cannot rebuild the whole fixture set. `Temp/` is scratch, safe to delete.

---

## Configuration

`server/src/config.js` computes `SERVER_ROOT/tmp/{uploads,outputs,work}` and reads these from the process environment, not from `server/.env` (nothing loads that file):

| Var | Default | Purpose |
|---|---|---|
| `PORT` | 5000 | Express port |
| `QPDF_BIN` | `qpdf` | qpdf binary |
| `LIBREOFFICE_BIN` | `soffice` | soffice binary |

`CLEANUP_INTERVAL_MS` 5m, `DOWNLOAD_TTL_MS` 30m, `ensureRuntimeDirectories()` on startup.

`client/vite.config.js` proxy `/process,/download,/health -> :5000`. Tailwind custom `ink/deep/panel/elevated/borderDark/borderStrong/offWhite/muted/orange*` plus `success/warning/error/info` with `Bg`/`Text` pairs, all `var(--x)`. Fonts `Inter` (display and body) and `JetBrains Mono` (mono).

`utils/constants.js` is single source: `MIME_BY_EXTENSION`, `SUPPORTED_EXTENSIONS`, `FILE_KIND_BY_EXTENSION`, `CONVERSION_TARGETS`, `OPERATION_MODES`, `MAX_UPLOAD_SIZE_BYTES` 50MB, `SECURE_ENCRYPTION_MESSAGE`.

---

## Dependencies

Server: `express`, `cors`, `multer`, `fs-extra`, `sharp`, `pdf-lib`, `pdf-parse`, `mammoth`, `exceljs`, `jszip`, `archiver`, `yauzl`, `tesseract.js`, `mime-types`, `nodemon` dev.  
Client: `react`, `react-dom`, `react-router-dom`, `lucide-react`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `postcss`, `autoprefixer`.

Internal: `server/src/routes/files.js -> upload, asyncQueue, processService, downloadStore`; `processService -> router, config, fs`; `router -> helpers/fileType, processors/*`.

---

## License

Copyright (c) 2026 Babariya Meet. All rights reserved.

No permission is granted to use, copy, modify, merge, publish, distribute, sublicense, create derivative works from, reference, reverse engineer for replication, or otherwise exploit this project, in whole or in part, for any purpose without prior written permission from the copyright holder.
