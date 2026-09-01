import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { safeUnlink, safeRemoveDir } from "../../../utils/helpers/fs.js";

const TMP_ROOT = path.join(os.tmpdir(), `drdocs-fs-${Date.now()}`);

describe("fs helpers safeUnlink / safeRemoveDir no-throw", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });
  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  describe("safeUnlink", () => {
    it("does not throw for null, undefined, empty string", async () => {
      await assert.doesNotReject(() => safeUnlink(null));
      await assert.doesNotReject(() => safeUnlink(undefined));
      await assert.doesNotReject(() => safeUnlink(""));
      await assert.doesNotReject(() => safeUnlink(0));
      await assert.doesNotReject(() => safeUnlink(false));
    });

    it("does not throw for non-existent file path", async () => {
      const fake = path.join(TMP_ROOT, "nonexistent-file.txt");
      await assert.doesNotReject(() => safeUnlink(fake));
      assert.equal(await fs.pathExists(fake), false);
    });

    it("removes existing file without throwing", async () => {
      const file = path.join(TMP_ROOT, "to-unlink.txt");
      await fs.writeFile(file, "hello");
      assert.ok(await fs.pathExists(file));
      await assert.doesNotReject(() => safeUnlink(file));
      assert.equal(await fs.pathExists(file), false);
    });

    it("removes file with nested directory and leaves dir", async () => {
      const dir = path.join(TMP_ROOT, "nested-unlink");
      await fs.ensureDir(dir);
      const file = path.join(dir, "inner.txt");
      await fs.writeFile(file, "data");
      await safeUnlink(file);
      assert.equal(await fs.pathExists(file), false);
      assert.ok(await fs.pathExists(dir));
    });

    it("is idempotent: calling twice does not throw", async () => {
      const file = path.join(TMP_ROOT, "idempotent.txt");
      await fs.writeFile(file, "once");
      await safeUnlink(file);
      await assert.doesNotReject(() => safeUnlink(file));
      await assert.doesNotReject(() => safeUnlink(file));
    });

    it("does not throw when fs.remove throws internally (mock permission)", async () => {
      const file = path.join(TMP_ROOT, "mock-throw.txt");
      await fs.writeFile(file, "x");
      const originalRemove = fs.remove;
      fs.remove = async () => { throw new Error("mock remove fail"); };
      try {
        await assert.doesNotReject(() => safeUnlink(file));
      } finally {
        fs.remove = originalRemove;
      }
      // restore and clean
      await fs.remove(file).catch(() => {});
    });

    it("handles path with spaces and special chars", async () => {
      const file = path.join(TMP_ROOT, "file with spaces & chars.txt");
      await fs.writeFile(file, "content");
      await assert.doesNotReject(() => safeUnlink(file));
      assert.equal(await fs.pathExists(file), false);
    });
  });

  describe("safeRemoveDir", () => {
    it("does not throw for null, undefined, empty", async () => {
      await assert.doesNotReject(() => safeRemoveDir(null));
      await assert.doesNotReject(() => safeRemoveDir(undefined));
      await assert.doesNotReject(() => safeRemoveDir(""));
      await assert.doesNotReject(() => safeRemoveDir(0));
    });

    it("does not throw for non-existent directory", async () => {
      const fakeDir = path.join(TMP_ROOT, "no-such-dir-123");
      await assert.doesNotReject(() => safeRemoveDir(fakeDir));
    });

    it("removes empty directory", async () => {
      const dir = path.join(TMP_ROOT, "empty-dir");
      await fs.ensureDir(dir);
      assert.ok(await fs.pathExists(dir));
      await assert.doesNotReject(() => safeRemoveDir(dir));
      assert.equal(await fs.pathExists(dir), false);
    });

    it("removes directory recursively with files", async () => {
      const dir = path.join(TMP_ROOT, "recursive-dir");
      await fs.ensureDir(path.join(dir, "sub", "deep"));
      await fs.writeFile(path.join(dir, "a.txt"), "a");
      await fs.writeFile(path.join(dir, "sub", "b.txt"), "b");
      await fs.writeFile(path.join(dir, "sub", "deep", "c.txt"), "c");
      await assert.doesNotReject(() => safeRemoveDir(dir));
      assert.equal(await fs.pathExists(dir), false);
    });

    it("is idempotent after removal", async () => {
      const dir = path.join(TMP_ROOT, "idempotent-dir");
      await fs.ensureDir(dir);
      await fs.writeFile(path.join(dir, "file.txt"), "hi");
      await safeRemoveDir(dir);
      await assert.doesNotReject(() => safeRemoveDir(dir));
      await assert.doesNotReject(() => safeRemoveDir(dir));
    });

    it("does not throw when fs.remove throws internally", async () => {
      const dir = path.join(TMP_ROOT, "mock-throw-dir");
      await fs.ensureDir(dir);
      const originalRemove = fs.remove;
      fs.remove = async () => { throw new Error("mock dir fail"); };
      try {
        await assert.doesNotReject(() => safeRemoveDir(dir));
      } finally {
        fs.remove = originalRemove;
      }
      await fs.remove(dir).catch(() => {});
    });

    it("removes directory containing file with spaces", async () => {
      const dir = path.join(TMP_ROOT, "dir with spaces");
      await fs.ensureDir(dir);
      await fs.writeFile(path.join(dir, "file name.txt"), "content");
      await assert.doesNotReject(() => safeRemoveDir(dir));
      assert.equal(await fs.pathExists(dir), false);
    });

    it("safeUnlink and safeRemoveDir do not interfere with each other", async () => {
      const dir = path.join(TMP_ROOT, "mixed");
      await fs.ensureDir(dir);
      const file = path.join(dir, "file.txt");
      await fs.writeFile(file, "x");
      await safeUnlink(file);
      assert.equal(await fs.pathExists(file), false);
      assert.ok(await fs.pathExists(dir));
      await safeRemoveDir(dir);
      assert.equal(await fs.pathExists(dir), false);
    });
  });
});
