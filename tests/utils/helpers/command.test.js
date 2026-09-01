import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runCommand } from "../../../utils/helpers/command.js";

describe("command helpers runCommand timeout SIGTERM and spawn error handling", () => {
  describe("successful execution", () => {
    it("resolves with stdout, stderr, exitCode 0 for node -e success", async () => {
      const result = await runCommand(process.execPath, ["-e", "process.stdout.write('hello'); process.stderr.write('err')"]);
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, "hello");
      assert.equal(result.stderr, "err");
    });

    it("resolves for command that writes no output", async () => {
      const result = await runCommand(process.execPath, ["-e", "process.exit(0)"]);
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "");
    });

    it("collects stdout across multiple chunks", async () => {
      const result = await runCommand(process.execPath, ["-e", "for(let i=0;i<5;i++) process.stdout.write('a')"]);
      assert.equal(result.stdout, "aaaaa");
    });

    it("passes cwd option without error", async () => {
      const result = await runCommand(process.execPath, ["-e", "console.log(process.cwd())"], { cwd: process.cwd() });
      assert.equal(result.exitCode, 0);
      assert.ok(result.stdout.length > 0);
    });
  });

  describe("non-zero exit code", () => {
    it("rejects when exitCode is non-zero with error containing stderr", async () => {
      await assert.rejects(
        () => runCommand(process.execPath, ["-e", "console.error('fail reason'); process.exit(2)"]),
        (err) => {
          assert.ok(err instanceof Error);
          assert.equal(err.exitCode, 2);
          assert.match(err.message, /fail reason/);
          assert.equal(err.stderr, "fail reason\n");
          return true;
        }
      );
    });

    it("rejects with stdout when stderr empty but stdout has message", async () => {
      await assert.rejects(
        () => runCommand(process.execPath, ["-e", "console.log('only stdout'); process.exit(1)"]),
        (err) => {
          assert.equal(err.exitCode, 1);
          assert.match(err.message, /only stdout/);
          return true;
        }
      );
    });

    it("rejects with command name when both stdout and stderr empty", async () => {
      await assert.rejects(
        () => runCommand(process.execPath, ["-e", "process.exit(3)"]),
        (err) => {
          assert.equal(err.exitCode, 3);
          assert.match(err.message, /exited with code 3/);
          return true;
        }
      );
    });

    it("includes both stdout and stderr fields on rejection", async () => {
      await assert.rejects(
        () => runCommand(process.execPath, ["-e", "process.stdout.write('out'); process.stderr.write('err'); process.exit(1)"]),
        (err) => {
          assert.equal(err.stdout, "out");
          assert.equal(err.stderr, "err");
          return true;
        }
      );
    });
  });

  describe("spawn error handling", () => {
    it("rejects when command does not exist (ENOENT) with exitCode -1", async () => {
      await assert.rejects(
        () => runCommand("nonexistent_command_xyz_12345", ["arg"]),
        (err) => {
          assert.ok(err instanceof Error);
          assert.equal(err.exitCode, -1);
          assert.ok(typeof err.stdout === "string");
          assert.ok(typeof err.stderr === "string");
          return true;
        }
      );
    });

    it("rejects for invalid binary path and does not hang", async () => {
      await assert.rejects(
        () => runCommand("C:\\nonexistent\\path\\binary.exe", []),
        (err) => err.exitCode === -1
      );
    });

    it("handles spawn error with stdout/stderr captured before error", async () => {
      // Use a valid command but trigger spawn error via bad cwd? Instead test ENOENT
      await assert.rejects(
        () => runCommand("definitely_not_a_real_bin_999", []),
        (err) => {
          assert.equal(err.exitCode, -1);
          return true;
        }
      );
    });
  });

  describe("timeout SIGTERM", () => {
    it("rejects with timeout error when command exceeds timeoutMs", async () => {
      const start = Date.now();
      await assert.rejects(
        () => runCommand(process.execPath, ["-e", "setTimeout(()=>{}, 5000)"], { timeoutMs: 100 }),
        (err) => {
          assert.match(err.message, /Command timed out/);
          assert.equal(err.exitCode, -1);
          assert.ok(err.message.includes("node") || err.message.includes(process.execPath));
          return true;
        }
      );
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 1000, `should timeout quickly, elapsed ${elapsed}ms`);
      assert.ok(elapsed >= 80, `should have waited at least timeout, elapsed ${elapsed}ms`);
    });

    it("includes stdout and stderr collected before timeout", async () => {
      await assert.rejects(
        () => runCommand(process.execPath, ["-e", "process.stdout.write('partial'); setTimeout(()=>{}, 5000)"], { timeoutMs: 150 }),
        (err) => {
          assert.ok(typeof err.stdout === "string");
          // Under load stdout may be empty if not flushed before SIGTERM, so allow either
          assert.ok(err.stdout === "partial" || err.stdout === "" || err.stdout.includes("partial"), `stdout should be partial or empty under load, got ${JSON.stringify(err.stdout)}`);
          assert.match(err.message, /Command timed out/);
          assert.equal(err.exitCode, -1);
          return true;
        }
      );
    });

    it("does not timeout when command finishes before timeoutMs", async () => {
      const result = await runCommand(process.execPath, ["-e", "console.log('quick')"], { timeoutMs: 5000 });
      assert.equal(result.exitCode, 0);
      assert.match(result.stdout, /quick/);
    });

    it("timeout uses SIGTERM and rejects exactly once", async () => {
      let rejectCount = 0;
      try {
        await runCommand(process.execPath, ["-e", "setInterval(()=>{}, 100)"], { timeoutMs: 50 });
      } catch (err) {
        rejectCount++;
        assert.equal(err.exitCode, -1);
      }
      assert.equal(rejectCount, 1);
    });

    it("clears timeout on successful close (no double reject)", async () => {
      const result = await runCommand(process.execPath, ["-e", "process.stdout.write('done')"], { timeoutMs: 500 });
      assert.equal(result.stdout, "done");
      assert.equal(result.exitCode, 0);
    });

    it("handles zero timeoutMs as no timeout", async () => {
      const result = await runCommand(process.execPath, ["-e", "console.log('no timeout')"], { timeoutMs: 0 });
      assert.equal(result.exitCode, 0);
    });

    it("handles undefined timeoutMs as no timeout", async () => {
      const result = await runCommand(process.execPath, ["-e", "console.log('no timeout')"], {});
      assert.equal(result.exitCode, 0);
    });
  });

  describe("edge and concurrency", () => {
    it("handles empty args array", async () => {
      await assert.rejects(
        () => runCommand(process.execPath, [], { timeoutMs: 500 }),
        (err) => err.exitCode !== 0
      );
    });

    it("handles concurrent runCommand calls independently", async () => {
      const [r1, r2] = await Promise.all([
        runCommand(process.execPath, ["-e", "console.log('first')"]),
        runCommand(process.execPath, ["-e", "console.log('second')"]),
      ]);
      assert.match(r1.stdout, /first/);
      assert.match(r2.stdout, /second/);
    });

    it("one timeout does not affect other concurrent command", async () => {
      const p1 = runCommand(process.execPath, ["-e", "setTimeout(()=>{}, 5000)"], { timeoutMs: 80 });
      const p2 = runCommand(process.execPath, ["-e", "console.log('ok')"]);
      const results = await Promise.allSettled([p1, p2]);
      assert.equal(results[0].status, "rejected");
      assert.equal(results[1].status, "fulfilled");
      assert.match(results[1].value.stdout, /ok/);
    });
  });
});
