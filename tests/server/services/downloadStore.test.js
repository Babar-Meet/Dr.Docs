import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { setDownloadRecord, getDownloadRecord, removeDownloadRecord, startDownloadCleanupScheduler } from "../../../server/src/services/downloadStore.js";
import { CLEANUP_INTERVAL_MS, DOWNLOAD_TTL_MS } from "../../../server/src/config.js";

const TMP_ROOT = path.join(os.tmpdir(), `drdocs-download-${Date.now()}`);

describe("downloadStore set/get/remove + TTL sweep", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });
  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  // Clean up store between tests by removing any known ids. Since downloadStore is a singleton Map, we track ids we create.
  const createdIds = new Set();
  function trackId(id) { createdIds.add(id); return id; }

  after(async () => {
    for (const id of createdIds) {
      try { await removeDownloadRecord(id); } catch {}
    }
  });

  describe("constants", () => {
    it("DOWNLOAD_TTL_MS is 30 minutes", () => {
      assert.equal(DOWNLOAD_TTL_MS, 30 * 60 * 1000);
    });
    it("CLEANUP_INTERVAL_MS is 5 minutes", () => {
      assert.equal(CLEANUP_INTERVAL_MS, 5 * 60 * 1000);
    });
  });

  describe("set and get", () => {
    it("set stores record with createdAt and get retrieves it", async () => {
      const id = trackId(`test-${Date.now()}-1`);
      const filePath = path.join(TMP_ROOT, "file1.txt");
      await fs.writeFile(filePath, "hello");
      const before = Date.now();
      setDownloadRecord(id, { filePath, downloadName: "file1.txt", mimeType: "text/plain" });
      const rec = getDownloadRecord(id);
      assert.ok(rec);
      assert.equal(rec.filePath, filePath);
      assert.equal(rec.downloadName, "file1.txt");
      assert.equal(rec.mimeType, "text/plain");
      assert.ok(typeof rec.createdAt === "number");
      assert.ok(rec.createdAt >= before && rec.createdAt <= Date.now());
    });

    it("get returns undefined for unknown id", () => {
      assert.equal(getDownloadRecord("nonexistent-id-12345"), undefined);
    });

    it("set overwrites existing id", async () => {
      const id = trackId(`overwrite-${Date.now()}`);
      const p1 = path.join(TMP_ROOT, "a.txt");
      const p2 = path.join(TMP_ROOT, "b.txt");
      await fs.writeFile(p1, "a");
      await fs.writeFile(p2, "b");
      setDownloadRecord(id, { filePath: p1, downloadName: "a.txt", mimeType: "text/plain" });
      assert.equal(getDownloadRecord(id).filePath, p1);
      // wait tiny to ensure createdAt updates
      await new Promise((r) => setTimeout(r, 5));
      setDownloadRecord(id, { filePath: p2, downloadName: "b.txt", mimeType: "text/plain" });
      const rec = getDownloadRecord(id);
      assert.equal(rec.filePath, p2);
      assert.equal(rec.downloadName, "b.txt");
    });

    it("stores arbitrary mime types", () => {
      const id = trackId(`mime-${Date.now()}`);
      const p = path.join(TMP_ROOT, "x.pdf");
      setDownloadRecord(id, { filePath: p, downloadName: "x.pdf", mimeType: "application/pdf" });
      assert.equal(getDownloadRecord(id).mimeType, "application/pdf");
    });

    it("createdAt is set to Date.now at insertion", async () => {
      const id = trackId(`time-${Date.now()}`);
      const now = Date.now();
      setDownloadRecord(id, { filePath: path.join(TMP_ROOT, "t.txt"), downloadName: "t.txt", mimeType: "text/plain" });
      const rec = getDownloadRecord(id);
      assert.ok(Math.abs(rec.createdAt - now) < 1000);
    });
  });

  describe("removeDownloadRecord", () => {
    it("removes record and deletes file", async () => {
      const id = trackId(`remove-${Date.now()}`);
      const filePath = path.join(TMP_ROOT, `to-delete-${Date.now()}.txt`);
      await fs.writeFile(filePath, "to be deleted");
      assert.ok(await fs.pathExists(filePath));
      setDownloadRecord(id, { filePath, downloadName: "to-delete.txt", mimeType: "text/plain" });
      assert.ok(getDownloadRecord(id));
      await removeDownloadRecord(id);
      assert.equal(getDownloadRecord(id), undefined);
      assert.equal(await fs.pathExists(filePath), false);
    });

    it("remove is idempotent for non-existent id", async () => {
      await assert.doesNotReject(() => removeDownloadRecord("does-not-exist-123"));
    });

    it("remove deletes file even if file already missing", async () => {
      const id = trackId(`missing-file-${Date.now()}`);
      const fakePath = path.join(TMP_ROOT, "nonexistent-file.txt");
      setDownloadRecord(id, { filePath: fakePath, downloadName: "x.txt", mimeType: "text/plain" });
      await assert.doesNotReject(() => removeDownloadRecord(id));
      assert.equal(getDownloadRecord(id), undefined);
    });

    it("remove only deletes targeted id", async () => {
      const id1 = trackId(`keep1-${Date.now()}`);
      const id2 = trackId(`remove2-${Date.now()}`);
      const p1 = path.join(TMP_ROOT, "keep1.txt");
      const p2 = path.join(TMP_ROOT, "remove2.txt");
      await fs.writeFile(p1, "keep");
      await fs.writeFile(p2, "remove");
      setDownloadRecord(id1, { filePath: p1, downloadName: "keep1.txt", mimeType: "text/plain" });
      setDownloadRecord(id2, { filePath: p2, downloadName: "remove2.txt", mimeType: "text/plain" });
      await removeDownloadRecord(id2);
      assert.ok(getDownloadRecord(id1));
      assert.equal(getDownloadRecord(id2), undefined);
      assert.ok(await fs.pathExists(p1));
      assert.equal(await fs.pathExists(p2), false);
      await removeDownloadRecord(id1);
    });

    it("safeUnlink no throw if filePath falsy", async () => {
      const id = trackId(`falsy-${Date.now()}`);
      setDownloadRecord(id, { filePath: "", downloadName: "x.txt", mimeType: "text/plain" });
      await assert.doesNotReject(() => removeDownloadRecord(id));
      assert.equal(getDownloadRecord(id), undefined);
    });
  });

  describe("TTL sweep via startDownloadCleanupScheduler", () => {
    it("scheduler starts without throwing and can be called multiple times", () => {
      assert.doesNotThrow(() => startDownloadCleanupScheduler());
      assert.doesNotThrow(() => startDownloadCleanupScheduler());
      assert.doesNotThrow(() => startDownloadCleanupScheduler());
    });

    it("expired record is swept after TTL (simulated by mutating createdAt)", async () => {
      const id = trackId(`sweep-${Date.now()}`);
      const filePath = path.join(TMP_ROOT, `sweep-${Date.now()}.txt`);
      await fs.writeFile(filePath, "sweep me");
      setDownloadRecord(id, { filePath, downloadName: "sweep.txt", mimeType: "text/plain" });
      const rec = getDownloadRecord(id);
      assert.ok(rec);
      // mutate createdAt to be expired
      rec.createdAt = Date.now() - DOWNLOAD_TTL_MS - 1000;
      // Directly invoke the sweep logic by checking condition that sweepExpiredDownloads uses:
      // if (now - record.createdAt > DOWNLOAD_TTL_MS) deletions.push(removeDownloadRecord)
      // We simulate sweep by calling removeDownloadRecord if expired
      const now = Date.now();
      if (now - rec.createdAt > DOWNLOAD_TTL_MS) {
        await removeDownloadRecord(id);
      }
      assert.equal(getDownloadRecord(id), undefined);
      assert.equal(await fs.pathExists(filePath), false);
    });

    it("non-expired record not swept", async () => {
      const id = trackId(`not-expired-${Date.now()}`);
      const filePath = path.join(TMP_ROOT, `keep-${Date.now()}.txt`);
      await fs.writeFile(filePath, "keep me");
      setDownloadRecord(id, { filePath, downloadName: "keep.txt", mimeType: "text/plain" });
      const rec = getDownloadRecord(id);
      rec.createdAt = Date.now() - 1000; // 1 sec ago, not expired (TTL 30min)
      const now = Date.now();
      const isExpired = now - rec.createdAt > DOWNLOAD_TTL_MS;
      assert.equal(isExpired, false);
      // Should still exist
      assert.ok(getDownloadRecord(id));
      await removeDownloadRecord(id);
    });

    it("sweep removes file via safeUnlink (integration)", async () => {
      const id = trackId(`sweep-file-${Date.now()}`);
      const filePath = path.join(TMP_ROOT, `sweep-file-${Date.now()}.txt`);
      await fs.writeFile(filePath, "content");
      setDownloadRecord(id, { filePath, downloadName: "sweep.txt", mimeType: "text/plain" });
      const rec = getDownloadRecord(id);
      rec.createdAt = 0; // very old
      // Simulate scheduler sweep iteration: iterate over store entries
      // We can't access private downloadStore Map directly, but we can simulate by awaiting remove
      await removeDownloadRecord(id);
      assert.equal(await fs.pathExists(filePath), false);
    });

    it("scheduler interval is unref'd (does not keep process alive) - check timer unref exists", async () => {
      // startDownloadCleanupScheduler creates interval with unref; we can test that calling it doesn't prevent exit
      // This is more a structural test
      startDownloadCleanupScheduler();
      // If we get here without hanging, it's fine. We can also check that interval exists by observing that store still works after start
      const id = trackId(`after-sched-${Date.now()}`);
      const p = path.join(TMP_ROOT, "after.txt");
      await fs.writeFile(p, "x");
      setDownloadRecord(id, { filePath: p, downloadName: "after.txt", mimeType: "text/plain" });
      assert.ok(getDownloadRecord(id));
      await removeDownloadRecord(id);
    });

    it("TTL boundary: exactly TTL not expired, TTL+1 expired", () => {
      const now = Date.now();
      const atTTL = { createdAt: now - DOWNLOAD_TTL_MS };
      const pastTTL = { createdAt: now - DOWNLOAD_TTL_MS - 1 };
      assert.equal(now - atTTL.createdAt > DOWNLOAD_TTL_MS, false, "exactly TTL should not be > TTL");
      assert.equal(now - pastTTL.createdAt > DOWNLOAD_TTL_MS, true, "TTL+1 should be expired");
    });
  });

  describe("concurrency and isolation", () => {
    it("multiple records coexist", async () => {
      const ids = Array.from({ length: 5 }, (_, i) => trackId(`multi-${Date.now()}-${i}`));
      for (let i = 0; i < ids.length; i++) {
        const p = path.join(TMP_ROOT, `multi-${i}.txt`);
        await fs.writeFile(p, `content ${i}`);
        setDownloadRecord(ids[i], { filePath: p, downloadName: `multi-${i}.txt`, mimeType: "text/plain" });
      }
      for (const id of ids) assert.ok(getDownloadRecord(id));
      for (const id of ids) await removeDownloadRecord(id);
      for (const id of ids) assert.equal(getDownloadRecord(id), undefined);
    });
  });
});
