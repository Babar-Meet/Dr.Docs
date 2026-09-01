import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import JSZip from "jszip";
import yauzl from "yauzl";
import { fileURLToPath } from "node:url";
import { AppError } from "../../../utils/errors.js";
import { SECURE_ENCRYPTION_MESSAGE } from "../../../utils/constants.js";
import { normalizeZip } from "../../../utils/processors/zipProcessor.js";

const DOCS_ZIP_SIMPLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../Docs/zip/sample-simple.zip");
const TMP_ROOT = path.join(os.tmpdir(), `drdocs-zip-${Date.now()}`);

describe("zipProcessor security boundary", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });
  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  async function createSimpleZip(dir, name = "simple.zip", files = { "hello.txt": "hello world", "folder/nested.txt": "nested" }) {
    const zip = new JSZip();
    for (const [p, content] of Object.entries(files)) zip.file(p, content);
    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
    const out = path.join(dir, name);
    await fs.writeFile(out, buf);
    return out;
  }

  describe("PASSWORD_REQUIRED via yauzl generalPurposeBitFlag 0x1", () => {
    it("throws PASSWORD_REQUIRED when yauzl reports encrypted entry (mocked)", async () => {
      const work = path.join(TMP_ROOT, "zip-pwd-mock");
      await fs.ensureDir(work);
      const zipPath = await createSimpleZip(work, "in.zip");
      const out = path.join(work, "out.zip");
      const stub = mock.method(yauzl, "open", (inputPath, opts, callback) => {
        if (typeof opts === "function") { callback = opts; opts = {}; }
        const fakeZipFile = {
          on: (event, handler) => {
            if (event === "entry") {
              setImmediate(() => handler({ generalPurposeBitFlag: 0x1, fileName: "secret.txt" }));
            }
          },
          readEntry: () => {},
          close: () => {},
        };
        setImmediate(() => callback(null, fakeZipFile));
      });
      try {
        await assert.rejects(
          () => normalizeZip({ inputPath: zipPath, outputPath: out }),
          (err) => {
            assert.ok(err instanceof AppError);
            assert.equal(err.code, "PASSWORD_REQUIRED");
            assert.equal(err.message, SECURE_ENCRYPTION_MESSAGE);
            assert.equal(err.statusCode, 400);
            return true;
          }
        );
      } finally {
        stub.mock.restore();
      }
    });

    it("throws PASSWORD_REQUIRED with mocked encrypted zip via second style", async () => {
      const work = path.join(TMP_ROOT, "zip-pwd-2");
      await fs.ensureDir(work);
      const p = await createSimpleZip(work, "a.zip");
      const out = path.join(work, "out.zip");
      const stub = mock.method(yauzl, "open", (inputPath, opts, callback) => {
        if (typeof opts === "function") { callback = opts; }
        const fake = {
          on: (ev, h) => {
            if (ev === "entry") setImmediate(() => h({ generalPurposeBitFlag: 1 }));
          },
          readEntry: () => {},
          close: () => {},
        };
        setImmediate(() => callback(null, fake));
      });
      try {
        await assert.rejects(() => normalizeZip({ inputPath: p, outputPath: out }), (err) => err.code === "PASSWORD_REQUIRED");
      } finally {
        stub.mock.restore();
      }
    });

    it("throws FILE_CORRUPTED when yauzl.open fails (invalid zip)", async () => {
      const work = path.join(TMP_ROOT, "zip-corrupt-yauzl");
      await fs.ensureDir(work);
      const bad = path.join(work, "bad.zip");
      await fs.writeFile(bad, Buffer.from("not a zip"));
      const out = path.join(work, "out.zip");
      await assert.rejects(
        () => normalizeZip({ inputPath: bad, outputPath: out }),
        (err) => {
          assert.ok(err instanceof AppError);
          assert.equal(err.code, "FILE_CORRUPTED");
          return true;
        }
      );
    });

    it("throws FILE_CORRUPTED for bad zip content without mocking yauzl", async () => {
      const work = path.join(TMP_ROOT, "zip-bad-content");
      await fs.ensureDir(work);
      const bad = path.join(work, "bad2.zip");
      await fs.writeFile(bad, Buffer.from("PK\x03\x04 invalid zip content that is not a real zip"));
      const out = path.join(work, "out.zip");
      await assert.rejects(() => normalizeZip({ inputPath: bad, outputPath: out }), (err) => err.code === "FILE_CORRUPTED");
    });
  });

  describe("successful normalization", () => {
    it("normalizes simple zip fixture and writes output (no encryption)", async () => {
      const work = path.join(TMP_ROOT, "zip-success");
      await fs.ensureDir(work);
      let src = DOCS_ZIP_SIMPLE;
      if (!(await fs.pathExists(src))) src = await createSimpleZip(work, "src.zip");
      else {
        const copy = path.join(work, "src.zip");
        await fs.copy(src, copy);
        src = copy;
      }
      const out = path.join(work, "out.zip");
      await assert.doesNotReject(() => normalizeZip({ inputPath: src, outputPath: out }));
      assert.ok(await fs.pathExists(out));
      const origBuf = await fs.readFile(src);
      const outBuf = await fs.readFile(out);
      const origZip = await JSZip.loadAsync(origBuf);
      const outZip = await JSZip.loadAsync(outBuf);
      const origFiles = Object.keys(origZip.files).sort();
      const outFiles = Object.keys(outZip.files).sort();
      assert.deepEqual(outFiles, origFiles);
    });

    it("normalizes generated zip with multiple files", async () => {
      const work = path.join(TMP_ROOT, "zip-multi");
      await fs.ensureDir(work);
      const src = await createSimpleZip(work, "multi.zip", { "a.txt": "a", "b.txt": "b", "dir/c.txt": "c" });
      const out = path.join(work, "out.zip");
      await normalizeZip({ inputPath: src, outputPath: out });
      assert.ok(await fs.pathExists(out));
    });

    it("re-compresses with DEFLATE level 9", async () => {
      const work = path.join(TMP_ROOT, "zip-recompress");
      await fs.ensureDir(work);
      const src = await createSimpleZip(work, "re.zip", { "large.txt": "x".repeat(1000) });
      const out = path.join(work, "out.zip");
      await normalizeZip({ inputPath: src, outputPath: out });
      const statIn = await fs.stat(src);
      const statOut = await fs.stat(out);
      assert.ok(statOut.size > 0);
      assert.ok(statOut.size <= statIn.size * 1.5);
    });
  });

  describe("edge and error paths", () => {
    it("throws FILE_CORRUPTED for empty file", async () => {
      const work = path.join(TMP_ROOT, "zip-empty");
      await fs.ensureDir(work);
      const empty = path.join(work, "empty.zip");
      await fs.writeFile(empty, Buffer.alloc(0));
      const out = path.join(work, "out.zip");
      await assert.rejects(() => normalizeZip({ inputPath: empty, outputPath: out }), (err) => err.code === "FILE_CORRUPTED");
    });

    it("throws FILE_CORRUPTED for truncated zip", async () => {
      const work = path.join(TMP_ROOT, "zip-trunc");
      await fs.ensureDir(work);
      const src = await createSimpleZip(work, "src.zip");
      const buf = await fs.readFile(src);
      const truncated = buf.subarray(0, 10);
      const bad = path.join(work, "trunc.zip");
      await fs.writeFile(bad, truncated);
      const out = path.join(work, "out.zip");
      await assert.rejects(() => normalizeZip({ inputPath: bad, outputPath: out }), (err) => err.code === "FILE_CORRUPTED");
    });

    it("ensures PASSWORD_REQUIRED message is SECURE_ENCRYPTION_MESSAGE", async () => {
      const work = path.join(TMP_ROOT, "zip-secure-msg");
      await fs.ensureDir(work);
      const p = await createSimpleZip(work, "a.zip");
      const out = path.join(work, "out.zip");
      const stub = mock.method(yauzl, "open", (ip, opts, cb) => {
        if (typeof opts === "function") cb = opts;
        const fake = { on: (ev, h) => { if (ev === "entry") setImmediate(() => h({ generalPurposeBitFlag: 0x1 })); }, readEntry: () => {}, close: () => {} };
        setImmediate(() => cb(null, fake));
      });
      try {
        await assert.rejects(() => normalizeZip({ inputPath: p, outputPath: out }), (err) => {
          assert.equal(err.message, SECURE_ENCRYPTION_MESSAGE);
          return true;
        });
      } finally {
        stub.mock.restore();
      }
    });
  });
});
