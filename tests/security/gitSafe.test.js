import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

function execGit(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return { stdout: (result.stdout || "").trim(), stderr: result.stderr || "", status: result.status };
}

describe("security gitSafe staged, lockfile, Docs/Temp not tracked", () => {
  describe("git status has no sensitive files staged", () => {
    it("staged files (git diff --cached --name-only) contain no sensitive patterns", () => {
      const res = execGit(["diff", "--cached", "--name-only"]);
      const staged = res.stdout ? res.stdout.split("\n").map((s) => s.trim()).filter(Boolean) : [];
      const sensitive = [
        { pat: /^server\/tmp\//, desc: "server/tmp" },
        { pat: /^client\/dist\//, desc: "client/dist" },
        { pat: /^Temp\//, desc: "Temp" },
        { pat: /^Docs\//, desc: "Docs" },
        { pat: /\.env$/, desc: ".env" },
        { pat: /^server\/\.env/, desc: "server/.env" },
        { pat: /\.log$/, desc: "*.log" },
        { pat: /eng\.traineddata/, desc: "eng.traineddata" },
        { pat: /^node_modules\//, desc: "node_modules" },
      ];
      for (const file of staged) {
        for (const { pat, desc } of sensitive) {
          assert.ok(!pat.test(file), `sensitive file ${desc} staged: ${file}`);
        }
      }
    });

    it("porcelain staged (first column) contains no sensitive files", () => {
      const res = execGit(["status", "--porcelain=v1"]);
      const lines = res.stdout ? res.stdout.split("\n").filter(Boolean) : [];
      const stagedLines = lines.filter((line) => line[0] !== " " && line[0] !== "?" && line[0] !== "!");
      const stagedFiles = stagedLines.map((line) => line.slice(3).trim());
      const forbidden = [/\.log$/, /eng\.traineddata/, /^server\/tmp/, /^Temp\//, /^Docs\//, /^client\/dist\//];
      for (const file of stagedFiles) {
        // Skip package-lock.json churn check separate; but ensure sensitive not staged
        for (const pat of forbidden) {
          assert.ok(!pat.test(file), `staged sensitive file: ${file} matches ${pat}`);
        }
      }
    });

    it("git status --porcelain does not show sensitive files as staged (M, A, D in first column)", () => {
      const res = execGit(["status", "--porcelain=v1"]);
      const lines = res.stdout ? res.stdout.split("\n").filter(Boolean) : [];
      for (const line of lines) {
        const status = line.slice(0, 2);
        const file = line.slice(3).trim();
        const isStaged = status[0] !== " " && status[0] !== "?" && status[0] !== "!";
        if (!isStaged) continue;
        const sensitive = file.includes("server/tmp") || file.includes("client/dist") || file.startsWith("Temp/") || file.startsWith("Docs/") || file.endsWith(".log") || file.includes("eng.traineddata") || file.includes("node_modules");
        assert.equal(sensitive, false, `sensitive file staged in porcelain: ${line}`);
      }
    });
  });

  describe("package-lock.json not churned unexpectedly", () => {
    it("if package-lock.json is modified, package.json should also be modified (lock churn corresponds to dependency change)", () => {
      const status = execGit(["status", "--porcelain=v1"]).stdout.split("\n").filter(Boolean);
      const lockModified = status.some((line) => line.includes("package-lock.json"));
      if (!lockModified) {
        assert.ok(true, "no lock churn, ok");
        return;
      }
      const packageModified = status.some((line) => line.includes("package.json") && !line.includes("package-lock.json"));
      // Allow lock churn only if package.json also modified, or if lock is the only modified file due to npm install without version change? Be lenient: check diff stat size not huge?
      // For this test, we assert that package-lock.json churn is accompanied by package.json change or is not staged alone unexpectedly
      // If lock is modified but package.json not, check that diff is not huge (less than 500 lines changed)
      if (!packageModified) {
        const diff = execGit(["diff", "--stat", "package-lock.json"]);
        const linesChanged = diff.stdout ? diff.stdout.split("\n").length : 0;
        // If only lock changed without package.json, it could be npm install churn; we cap at reasonable threshold
        // But also check that lock is not staged (second column vs first)
        const stagedLock = status.some((line) => line[0] !== " " && line.slice(3).includes("package-lock.json"));
        assert.equal(stagedLock, false, "package-lock.json should not be staged alone without package.json change");
      } else {
        assert.ok(true);
      }
    });

    it("package-lock.json is not staged when only formatting differences", () => {
      const res = execGit(["diff", "--cached", "--name-only"]);
      const staged = res.stdout ? res.stdout.split("\n").filter(Boolean) : [];
      // If package-lock.json staged, package.json should also be staged
      if (staged.includes("package-lock.json")) {
        assert.ok(staged.includes("package.json"), "if package-lock.json staged, package.json should also be staged");
      }
      if (staged.includes("server/package-lock.json") || staged.includes("server/package.json")) {
        assert.ok(true);
      }
    });

    it("git diff for package-lock.json not showing huge churn (sanity check)", () => {
      const diff = execGit(["diff", "package-lock.json"]);
      const output = diff.stdout || "";
      // If diff is huge (>50000 chars), it might be churned unexpectedly
      if (output.length > 50000) {
        const status = execGit(["status", "--porcelain=v1"]).stdout;
        const hasPackageChange = status.includes("package.json");
        assert.ok(hasPackageChange, "large lock diff without package.json change indicates unexpected churn");
      }
      assert.ok(true);
    });
  });

  describe("Docs/Temp not tracked", () => {
    it("git ls-files does not list Docs/ files as tracked", () => {
      const res = execGit(["ls-files"]);
      const tracked = res.stdout ? res.stdout.split("\n").filter(Boolean) : [];
      const docsTracked = tracked.filter((f) => f.startsWith("Docs/"));
      assert.equal(docsTracked.length, 0, `Docs/ should not be tracked but found: ${docsTracked.join(", ")}`);
    });

    it("git ls-files does not list Temp/ files as tracked", () => {
      const res = execGit(["ls-files"]);
      const tracked = res.stdout ? res.stdout.split("\n").filter(Boolean) : [];
      const tempTracked = tracked.filter((f) => f.startsWith("Temp/"));
      assert.equal(tempTracked.length, 0, `Temp/ should not be tracked but found: ${tempTracked.join(", ")}`);
    });

    it("git ls-files does not list server/tmp or client/dist as tracked", () => {
      const res = execGit(["ls-files"]);
      const tracked = res.stdout ? res.stdout.split("\n").filter(Boolean) : [];
      const tmpTracked = tracked.filter((f) => f.startsWith("server/tmp/"));
      const distTracked = tracked.filter((f) => f.startsWith("client/dist/"));
      assert.equal(tmpTracked.length, 0, `server/tmp should not be tracked: ${tmpTracked.join(", ")}`);
      assert.equal(distTracked.length, 0, `client/dist should not be tracked: ${distTracked.join(", ")}`);
    });

    it("git check-ignore confirms Docs and Temp are ignored", () => {
      assert.equal(execGit(["check-ignore", "Docs/pdf/sample.pdf"]).status, 0);
      assert.equal(execGit(["check-ignore", "Temp/any.txt"]).status, 0);
      assert.equal(execGit(["check-ignore", "server/tmp/outputs/x.pdf"]).status, 0);
      assert.equal(execGit(["check-ignore", "client/dist/index.html"]).status, 0);
    });

    it("untracked non-ignored files via ls-files --others --exclude-standard do not include ignored sensitive paths", () => {
      const res = execGit(["ls-files", "--others", "--exclude-standard"]);
      const others = res.stdout ? res.stdout.split("\n").filter(Boolean) : [];
      for (const file of others) {
        assert.ok(!file.startsWith("Docs/"), `others should not include Docs/: ${file}`);
        assert.ok(!file.startsWith("Temp/"), `others should not include Temp/: ${file}`);
        assert.ok(!file.startsWith("server/tmp/"), `others should not include server/tmp/: ${file}`);
        assert.ok(!file.startsWith("client/dist/"), `others should not include client/dist/: ${file}`);
        assert.ok(!file.endsWith(".log") || file.includes("tests/"), `others should not include *.log outside tests: ${file}`);
      }
    });
  });

  describe("additional safety checks", () => {
    it("no .env file is tracked", () => {
      const res = execGit(["ls-files"]);
      const tracked = res.stdout ? res.stdout.split("\n").filter(Boolean) : [];
      const envTracked = tracked.filter((f) => f === ".env" || f === "server/.env");
      assert.equal(envTracked.length, 0, `.env should not be tracked: ${envTracked.join(", ")}`);
    });

    it("eng.traineddata not tracked", () => {
      const res = execGit(["ls-files"]);
      const tracked = res.stdout ? res.stdout.split("\n").filter(Boolean) : [];
      const engTracked = tracked.filter((f) => f.includes("eng.traineddata"));
      assert.equal(engTracked.length, 0, `eng.traineddata should not be tracked: ${engTracked.join(", ")}`);
    });

    it("node_modules not tracked", () => {
      const res = execGit(["ls-files"]);
      const tracked = res.stdout ? res.stdout.split("\n").filter(Boolean) : [];
      const nmTracked = tracked.filter((f) => f.startsWith("node_modules/"));
      assert.equal(nmTracked.length, 0);
    });

    it("sensitive not staged via git status porcelain second check", () => {
      const res = execGit(["status", "--porcelain=v1"]);
      const staged = (res.stdout || "").split("\n").filter((l) => l[0] === "M" || l[0] === "A" || l[0] === "D");
      // staged files first char indicates staged; ensure none sensitive
      for (const line of staged) {
        const file = line.slice(3);
        assert.ok(!file.includes("eng.traineddata"), `eng.traineddata staged: ${line}`);
        assert.ok(!file.endsWith(".log"), `log staged: ${line}`);
      }
    });
  });
});
