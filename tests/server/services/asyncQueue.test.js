import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { AsyncTaskQueue } from "../../../server/src/services/asyncQueue.js";

describe("AsyncTaskQueue concurrency 2, FIFO, error propagation", () => {
  describe("basic functionality", () => {
    it("resolves single task result", async () => {
      const q = new AsyncTaskQueue(2);
      const res = await q.add(() => Promise.resolve(42));
      assert.equal(res, 42);
    });

    it("resolves synchronous task", async () => {
      const q = new AsyncTaskQueue(2);
      const res = await q.add(() => 123);
      assert.equal(res, 123);
    });

    it("rejects and propagates error", async () => {
      const q = new AsyncTaskQueue(2);
      await assert.rejects(() => q.add(() => Promise.reject(new Error("fail"))), /fail/);
    });

    it("continues after error - next task still runs", async () => {
      const q = new AsyncTaskQueue(2);
      const results = [];
      await assert.rejects(() => q.add(() => Promise.reject(new Error("oops"))), /oops/);
      const r = await q.add(() => 99);
      assert.equal(r, 99);
      // queue should still process
      const r2 = await q.add(() => "ok");
      assert.equal(r2, "ok");
    });

    it("handles task throwing synchronously", async () => {
      const q = new AsyncTaskQueue(2);
      await assert.rejects(() => q.add(() => { throw new Error("sync throw"); }), /sync throw/);
      const r = await q.add(() => "after sync error");
      assert.equal(r, "after sync error");
    });
  });

  describe("concurrency 2", () => {
    it("never exceeds concurrency 2", async () => {
      const q = new AsyncTaskQueue(2);
      let active = 0;
      let maxActive = 0;
      const tasks = [];
      for (let i = 0; i < 5; i++) {
        tasks.push(q.add(async () => {
          active++;
          maxActive = Math.max(maxActive, active);
          assert.ok(active <= 2, `active ${active} exceeds 2`);
          await new Promise((r) => setTimeout(r, 30));
          active--;
          return i;
        }));
      }
      const results = await Promise.all(tasks);
      assert.deepEqual(results, [0, 1, 2, 3, 4]);
      assert.equal(maxActive, 2);
    });

    it("concurrency 1 behaves as serial FIFO", async () => {
      const q = new AsyncTaskQueue(1);
      let active = 0;
      let maxActive = 0;
      const order = [];
      const tasks = [];
      for (let i = 0; i < 4; i++) {
        tasks.push(q.add(async () => {
          active++;
          maxActive = Math.max(maxActive, active);
          order.push(`start-${i}`);
          await new Promise((r) => setTimeout(r, 10));
          order.push(`end-${i}`);
          active--;
          return i;
        }));
      }
      const res = await Promise.all(tasks);
      assert.deepEqual(res, [0, 1, 2, 3]);
      assert.equal(maxActive, 1);
      assert.deepEqual(order, ["start-0", "end-0", "start-1", "end-1", "start-2", "end-2", "start-3", "end-3"]);
    });

    it("FIFO order with concurrency 2 still respects queue order for start times", async () => {
      const q = new AsyncTaskQueue(2);
      const startOrder = [];
      const tasks = [];
      // Use tasks with same delay to see FIFO start order: first 2 start immediately, next starts after one finishes
      for (let i = 0; i < 4; i++) {
        tasks.push(q.add(async () => {
          startOrder.push(i);
          await new Promise((r) => setTimeout(r, 20));
          return i;
        }));
      }
      await Promise.all(tasks);
      // startOrder should be 0,1,2,3 in FIFO order
      assert.deepEqual(startOrder, [0, 1, 2, 3]);
    });

    it("handles 10 concurrent adds with concurrency 2", async () => {
      const q = new AsyncTaskQueue(2);
      let concurrent = 0;
      let peak = 0;
      const promises = Array.from({ length: 10 }, (_, i) =>
        q.add(async () => {
          concurrent++;
          peak = Math.max(peak, concurrent);
          await new Promise((r) => setTimeout(r, 15));
          concurrent--;
          return i * 2;
        })
      );
      const vals = await Promise.all(promises);
      assert.equal(vals.length, 10);
      assert.equal(peak, 2);
      assert.deepEqual(vals, Array.from({ length: 10 }, (_, i) => i * 2));
    });

    it("custom concurrency 3 respected", async () => {
      const q = new AsyncTaskQueue(3);
      let active = 0;
      let max = 0;
      const ps = Array.from({ length: 6 }, () =>
        q.add(async () => {
          active++;
          max = Math.max(max, active);
          await new Promise((r) => setTimeout(r, 20));
          active--;
        })
      );
      await Promise.all(ps);
      assert.equal(max, 3);
    });
  });

  describe("FIFO ordering", () => {
    it("queue processes tasks in order even with varied delays (concurrency 1)", async () => {
      const q = new AsyncTaskQueue(1);
      const results = [];
      const p1 = q.add(async () => { await new Promise((r) => setTimeout(r, 30)); results.push(1); return 1; });
      const p2 = q.add(async () => { await new Promise((r) => setTimeout(r, 10)); results.push(2); return 2; });
      const p3 = q.add(async () => { results.push(3); return 3; });
      const vals = await Promise.all([p1, p2, p3]);
      assert.deepEqual(vals, [1, 2, 3]);
      assert.deepEqual(results, [1, 2, 3]);
    });

    it("FIFO with concurrency 2 still completes all", async () => {
      const q = new AsyncTaskQueue(2);
      const order = [];
      const tasks = [
        q.add(async () => { order.push(0); await new Promise((r) => setTimeout(r, 40)); return 0; }),
        q.add(async () => { order.push(1); await new Promise((r) => setTimeout(r, 10)); return 1; }),
        q.add(async () => { order.push(2); await new Promise((r) => setTimeout(r, 10)); return 2; }),
        q.add(async () => { order.push(3); return 3; }),
      ];
      const res = await Promise.all(tasks);
      assert.deepEqual(res, [0, 1, 2, 3]);
      // order of start should be FIFO
      assert.deepEqual(order.slice(0, 2), [0, 1]); // first two start immediately in order
    });

    it("maintains order when tasks resolve out of duration order but queue start is FIFO", async () => {
      const q = new AsyncTaskQueue(2);
      const completionOrder = [];
      const t1 = q.add(async () => { await new Promise((r) => setTimeout(r, 50)); completionOrder.push(1); return 1; });
      const t2 = q.add(async () => { await new Promise((r) => setTimeout(r, 10)); completionOrder.push(2); return 2; });
      const t3 = q.add(async () => { await new Promise((r) => setTimeout(r, 10)); completionOrder.push(3); return 3; });
      await Promise.all([t1, t2, t3]);
      // t2 should finish before t1 even though t1 started first; this is expected with concurrency 2
      assert.equal(completionOrder[0], 2);
    });
  });

  describe("error propagation", () => {
    it("rejected task does not block queue", async () => {
      const q = new AsyncTaskQueue(2);
      const pFail = q.add(() => Promise.reject(new Error("fail1")));
      const pOk = q.add(() => Promise.resolve("ok"));
      await assert.rejects(() => pFail, /fail1/);
      const r = await pOk;
      assert.equal(r, "ok");
    });

    it("multiple rejections handled independently", async () => {
      const q = new AsyncTaskQueue(2);
      const p1 = q.add(() => Promise.reject(new Error("e1")));
      const p2 = q.add(() => Promise.reject(new Error("e2")));
      const p3 = q.add(() => Promise.resolve("good"));
      await assert.rejects(() => p1, /e1/);
      await assert.rejects(() => p2, /e2/);
      assert.equal(await p3, "good");
    });

    it("error in one does not affect concurrent sibling", async () => {
      const q = new AsyncTaskQueue(2);
      let secondCompleted = false;
      const p1 = q.add(async () => { await new Promise((r) => setTimeout(r, 20)); throw new Error("boom"); });
      const p2 = q.add(async () => { await new Promise((r) => setTimeout(r, 10)); secondCompleted = true; return "second"; });
      await assert.rejects(() => p1, /boom/);
      assert.equal(await p2, "second");
      assert.equal(secondCompleted, true);
    });
  });

  describe("edge cases", () => {
    it("default concurrency is 2", () => {
      const q = new AsyncTaskQueue();
      assert.equal(q.concurrency, 2);
    });

    it("handles empty queue after drain", async () => {
      const q = new AsyncTaskQueue(2);
      await q.add(() => 1);
      // activeCount decrement happens in finally after microtask, so wait a tick
      await new Promise((r) => setImmediate(r));
      assert.equal(q.pending.length, 0);
      assert.equal(q.activeCount, 0);
      await q.add(() => 2);
      await new Promise((r) => setImmediate(r));
      assert.equal(q.pending.length, 0);
      assert.equal(q.activeCount, 0);
    });

    it("supports zero-delay tasks", async () => {
      const q = new AsyncTaskQueue(2);
      const vals = await Promise.all([q.add(() => 1), q.add(() => 2), q.add(() => 3)]);
      assert.deepEqual(vals, [1, 2, 3]);
    });

    it("queue can be reused after all tasks done", async () => {
      const q = new AsyncTaskQueue(2);
      assert.equal(await q.add(() => "a"), "a");
      assert.equal(await q.add(() => "b"), "b");
      assert.equal(await q.add(() => "c"), "c");
    });
  });
});
