export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export function getExtension(fileName) {
  const splitName = fileName.toLowerCase().split(".");
  return splitName.length > 1 ? `.${splitName.pop()}` : "";
}

export function formatBytes(value) {
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const sizeIndex = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const sizedValue = value / 1024 ** sizeIndex;
  return `${sizedValue.toFixed(sizeIndex === 0 ? 0 : 2)} ${units[sizeIndex]}`;
}
