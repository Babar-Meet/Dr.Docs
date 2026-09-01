export const SECURE_ENCRYPTION_MESSAGE =
  "This file is securely encrypted and requires the original password.";

export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;

export const MIME_BY_EXTENSION = {
  ".pdf": ["application/pdf"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ".pptx": [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  ".xlsx": [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".zip": [
    "application/zip",
    "application/x-zip-compressed",
    "multipart/x-zip",
  ],
};

export const GENERIC_ALLOWED_MIMES = ["application/octet-stream"];

export const SUPPORTED_EXTENSIONS = Object.keys(MIME_BY_EXTENSION);

export const FILE_KIND_BY_EXTENSION = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".pptx": "pptx",
  ".xlsx": "xlsx",
  ".jpg": "image",
  ".jpeg": "image",
  ".png": "image",
  ".zip": "zip",
};

export const CONVERSION_TARGETS = {
  ".pdf": ["docx", "pptx", "xlsx", "odt", "rtf", "txt", "html"],
  ".docx": ["pdf", "odt", "rtf", "txt", "html", "doc", "epub", "pptx"],
  ".pptx": ["pdf", "docx", "odp", "ppt", "html", "txt"],
  ".xlsx": ["pdf", "ods", "xls", "csv", "html", "txt"],
  ".jpg": ["pdf", "png", "webp", "avif", "tiff"],
  ".jpeg": ["pdf", "png", "webp", "avif", "tiff"],
  ".png": ["pdf", "jpg", "jpeg", "webp", "avif", "tiff"],
};

export const OPERATION_MODES = new Set([
  "unlock",
  "convert",
  "merge",
  "split",
  "ocr",
  "rotate",
  "compress",
]);
