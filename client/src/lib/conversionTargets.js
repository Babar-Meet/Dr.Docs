// Client mirror of CONVERSION_TARGETS in utils/constants.js. Keep both in sync.
export const CONVERSION_TARGETS = {
  ".pdf": ["docx", "pptx", "xlsx", "odt", "rtf", "txt", "html"],
  ".docx": ["pdf", "odt", "rtf", "txt", "html", "doc", "epub", "pptx"],
  ".pptx": ["pdf", "docx", "odp", "ppt", "html", "txt"],
  ".xlsx": ["pdf", "ods", "xls", "csv", "html", "txt"],
  ".jpg": ["pdf", "png", "webp", "avif", "tiff"],
  ".jpeg": ["pdf", "png", "webp", "avif", "tiff"],
  ".png": ["pdf", "jpg", "jpeg", "webp", "avif", "tiff"],
};

export const MERGE_TARGETS = ["pdf", "docx"];
