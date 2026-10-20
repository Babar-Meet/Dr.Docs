import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import {
  REPO_ROOT,
  VENDOR_BIN_DIR,
  resolveBinaryLocation,
  locateVendorBinary,
  QPDF_BIN,
  LIBREOFFICE_BIN,
} from "../../../server/src/config.js";

const TMP_ROOT = path.join(os.tmpdir(), `drdocs-config-${Date.now()}`);

describe("external binary resolution (env var, vendor/bin, PATH)", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });

  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  it("resolves in the order env var, then vendor file, then fallback", () => {
    assert.equal(
      resolveBinaryLocation({ envValue: "custom-qpdf", vendorFile: "v", fallback: "qpdf" }),
      "custom-qpdf",
      "an explicit env var always wins (today's behaviour stays)",
    );
    assert.equal(
      resolveBinaryLocation({ envValue: "", vendorFile: "vendor-path", fallback: "qpdf" }),
      "vendor-path",
      "a bundled vendor binary beats the PATH fallback",
    );
    assert.equal(
      resolveBinaryLocation({ envValue: undefined, vendorFile: null, fallback: "qpdf" }),
      "qpdf",
      "no env and no vendor falls back to PATH lookup",
    );
  });

  it("locateVendorBinary prefers the .exe name on Windows and the bare name elsewhere", async () => {
    const dir = path.join(TMP_ROOT, "vendor-bin");
    await fs.ensureDir(dir);
    assert.equal(locateVendorBinary(dir, "qpdf"), null, "an empty vendor dir resolves nothing");

    await fs.writeFile(path.join(dir, "qpdf.exe"), "stub");
    if (process.platform === "win32") {
      assert.equal(locateVendorBinary(dir, "qpdf"), path.join(dir, "qpdf.exe"));
    } else {
      assert.equal(locateVendorBinary(dir, "qpdf"), null);
    }

    await fs.writeFile(path.join(dir, "qpdf"), "stub");
    assert.ok(locateVendorBinary(dir, "qpdf"), "the bare name is a valid second candidate");
  });

  it("locateVendorBinary guards empty inputs", () => {
    assert.equal(locateVendorBinary(null, "qpdf"), null);
    assert.equal(locateVendorBinary(VENDOR_BIN_DIR, ""), null);
  });

  it("repo constants point at the repo root vendor/bin folder", () => {
    assert.equal(path.basename(REPO_ROOT), "Dr.Docs");
    assert.equal(VENDOR_BIN_DIR, path.join(REPO_ROOT, "vendor", "bin"));
  });

  it("the shipped exports match what is on disk: vendor file when present, PATH name when not", () => {
    const vendorQpdf = locateVendorBinary(VENDOR_BIN_DIR, "qpdf");
    const vendorSoffice = locateVendorBinary(VENDOR_BIN_DIR, "soffice");

    if (vendorQpdf) {
      assert.equal(QPDF_BIN, vendorQpdf);
    } else {
      assert.equal(QPDF_BIN, "qpdf", "no vendor bin means the PATH default stays");
    }

    if (vendorSoffice) {
      assert.equal(LIBREOFFICE_BIN, vendorSoffice);
    } else {
      assert.equal(LIBREOFFICE_BIN, "soffice", "no vendor bin means the PATH default stays");
    }
  });
});
