# Dr.Docs - Technical Documentation

## Overview
**Dr.Docs** is a specialized web application designed for students and faculty to securely process, convert, and repair files. It is built as a monorepo with a React frontend and an Express backend, using a modular processor system to handle various file formats.

---

##  Architecture

### 1. Monorepo Structure
- `/client`: React frontend (Vite + TailwindCSS)
- `/server`: Express backend (Node.js)
- `/utils`: Common processing logic, helpers, and constants shared by the backend.

### 2. File Processing Pipeline
The processing flow is managed by a centralized router (`/utils/processors/router.js`) which:
1. Validates the file signature and extension.
2. Identifies the requested mode (`auto`, `unlock`, `convert`, `optimize`, `repair`).
3. Dispatches the task to the specific file processor (PDF, Office, Image, etc.).
4. Cleans up temporary files from the server's `tmp/` folder.

---

##  Key Components

###  Backend (Express)
- **`multer`**: Handles multipart/form-data uploads.
- **`AsyncTaskQueue`**: An in-memory queue that ensures high-resource tasks (like LibreOffice conversions) are processed sequentially, preventing server crash on concurrent hits.
- **`downloadStore`**: Manages the mapping of unique IDs to generated files, allowing users to securely download their processed results via a single-use ID.

###  Frontend (React)
- **Drag-and-Drop**: Built using native HTML5 drag-and-drop combined with a clean UI.
- **Vite Proxy**: Configured to proxy API requests from `:5173` to `:5000` for development.

###  Processor Modules
- **qpdf**: Used for removing PDF restrictions.
- **LibreOffice (soffice)**: Powers the heavy-lifting conversions (e.g., DOCX to PDF).
- **mammoth/jszip**: Handles Word and PowerPoint XML manipulation to strip editing protections.
- **exceljs**: Modifies spreadsheet sheet protection flags.
- **sharp**: Optimizes images and handles image-to-PDF embedding.

---

##  API Reference

### `POST /process`
Main entry point for file processing.
- **Content-Type**: `multipart/form-data`
- **Fields**:
  - `file`: The uploaded file (max 50MB).
  - `operation`: Mode of operation (`auto`, `unlock`, `convert`, `optimize`, `repair`).
  - `targetFormat`: Required for `convert` mode (e.g., `pdf`, `docx`).
- **Returns**: A JSON payload with a `downloadId` and the processed file's status.

### `GET /download/:id`
Retrieves a processed file.
- **Param**: `id` - The unique ID returned by `/process`.
- **Behavior**: Streams the file to the browser and deletes it from storage immediately after completion.

### `GET /health`
Sanity check to confirm service availability.

---

##  Security Logic

1. **Encryption & DRM Policy**: The app explicitly checks for encryption signatures (like OLE headers or ZIP password flags) and aborts if the file is truly encrypted, informing the user that the original password is required.
2. **Path Sanitization**: All file paths are generated using UUIDs to prevent directory traversal attacks.
3. **Execution Guard**: No uploaded file is executed; they are only parsed by the processing libraries.
4. **Auto-Cleanup**: Temporary uploads are deleted immediately after processing, and outputs are deleted after download or after a 30-minute expiration buffer.

---

##  Technical Requirements

- **Node.js**: v18.0.0+
- **System Binaries**: `qpdf` and `soffice` (LibreOffice) must be accessible to the system or defined in the `.env` configuration.
- **Memory**: Minimum 2GB RAM (LibreOffice is memory-intensive).
