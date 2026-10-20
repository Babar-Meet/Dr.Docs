import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SERVER_ROOT = path.resolve(__dirname, "..");
// Repo root (one level above server/). vendor/bin is the portable drop
// folder for external tools, so a bundle can ship them beside the app.
export const REPO_ROOT = path.resolve(SERVER_ROOT, "..");
export const VENDOR_BIN_DIR = path.join(REPO_ROOT, "vendor", "bin");
export const TMP_ROOT = path.join(SERVER_ROOT, "tmp");
export const UPLOAD_DIR = path.join(TMP_ROOT, "uploads");
export const OUTPUT_DIR = path.join(TMP_ROOT, "outputs");
export const WORK_DIR = path.join(TMP_ROOT, "work");

export const PORT = Number.parseInt(process.env.PORT ?? "5000", 10);

// Resolution order for external binaries: an explicit env var first, then
// the vendor/bin bundle folder, then PATH through the bare command name.
// Pure so tests can pin the order without touching process.env.
export function resolveBinaryLocation({ envValue, vendorFile, fallback }) {
  if (envValue) return envValue;
  if (vendorFile) return vendorFile;
  return fallback;
}

// Windows bundles keep the .exe name; the bare name is also accepted so a
// Unix-style vendor tree works on any platform.
export function locateVendorBinary(dir, name) {
  if (!dir || !name) return null;
  const candidates =
    process.platform === "win32" ? [`${name}.exe`, name] : [name];
  for (const candidate of candidates) {
    const candidatePath = path.join(dir, candidate);
    if (fs.existsSync(candidatePath)) return candidatePath;
  }
  return null;
}

export const QPDF_BIN = resolveBinaryLocation({
  envValue: process.env.QPDF_BIN,
  vendorFile: locateVendorBinary(VENDOR_BIN_DIR, "qpdf"),
  fallback: "qpdf",
});
export const LIBREOFFICE_BIN = resolveBinaryLocation({
  envValue: process.env.LIBREOFFICE_BIN,
  vendorFile: locateVendorBinary(VENDOR_BIN_DIR, "soffice"),
  fallback: "soffice",
});

export const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
export const DOWNLOAD_TTL_MS = 30 * 60 * 1000;

export async function ensureRuntimeDirectories() {
  await Promise.all([
    fs.ensureDir(TMP_ROOT),
    fs.ensureDir(UPLOAD_DIR),
    fs.ensureDir(OUTPUT_DIR),
    fs.ensureDir(WORK_DIR),
  ]);
}
