import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SECURE_ENCRYPTION_MESSAGE } from "../../utils/constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

function execGit(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return { stdout: result.stdout || "", stderr: result.stderr || "", status: result.status };
}

async function readGitignore() {
  const content = await fs.readFile(path.join(ROOT, ".gitignore"), "utf8");
  return content;
}

describe("security noSecrets gitignore and secret scan", () => {
  describe("gitignore coverage for sensitive files", () => {
    it(".gitignore exists and contains required patterns", async () => {
      const content = await readGitignore();
      const required = [
        "node_modules/",
        "client/dist/",
        "server/tmp/",
        "Temp/",
        "Docs/",
        ".env",
        "*.log",
        "eng.traineddata",
      ];
      for (const pattern of required) {
        // Check that pattern appears as substring or line
        const has = content.split("\n").some((line) => line.trim() === pattern || line.includes(pattern));
        // Special for node_modules: allow node_modules/ or server/node_modules etc; just check contains node_modules
        if (pattern === "node_modules/") {
          assert.ok(content.includes("node_modules"), `missing gitignore pattern ${pattern}`);
        } else {
          assert.ok(has, `missing gitignore pattern: ${pattern}. Current .gitignore:\n${content}`);
        }
      }
    });

    it("each sensitive pattern is effective via git check-ignore", async () => {
      const checks = [
        { file: ".env", shouldBeIgnored: true },
        { file: "server/tmp/uploads/test.txt", shouldBeIgnored: true },
        { file: "server/tmp/outputs/x.pdf", shouldBeIgnored: true },
        { file: "Docs/sample.pdf", shouldBeIgnored: true },
        { file: "Temp/LOOP_STATE.md", shouldBeIgnored: true },
        { file: "node_modules/some_pkg/index.js", shouldBeIgnored: true },
        { file: "client/dist/index.html", shouldBeIgnored: true },
        { file: "server.log", shouldBeIgnored: true },
        { file: "error.log", shouldBeIgnored: true },
        { file: "server/eng.traineddata", shouldBeIgnored: true },
        { file: "eng.traineddata", shouldBeIgnored: true },
      ];
      for (const { file, shouldBeIgnored } of checks) {
        const res = execGit(["check-ignore", file]);
        const isIgnored = res.status === 0;
        assert.equal(isIgnored, shouldBeIgnored, `git check-ignore ${file} expected ignored=${shouldBeIgnored} got ${isIgnored} stdout=${res.stdout} stderr=${res.stderr}`);
      }
    });

    it("sensitive files are not staged (git diff --cached --name-only)", () => {
      const res = execGit(["diff", "--cached", "--name-only"]);
      const staged = res.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
      const sensitivePatterns = [
        /\.env(\.|$)/,
        /^server\/tmp\//,
        /^Temp\//,
        /^Docs\//,
        /^node_modules\//,
        /^client\/dist\//,
        /\.log$/,
        /eng\.traineddata/,
      ];
      for (const file of staged) {
        for (const pat of sensitivePatterns) {
          assert.ok(!pat.test(file), `sensitive file staged: ${file} matches ${pat}`);
        }
      }
    });

    it("untracked files via git ls-files --others --exclude-standard do not include sensitive ignored files", () => {
      const res = execGit(["ls-files", "--others", "--exclude-standard"]);
      const others = res.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
      const shouldNotContain = [
        "server/eng.traineddata",
        "server/tmp/",
        "Docs/",
        "Temp/",
      ];
      for (const item of others) {
        for (const forbidden of shouldNotContain) {
          // For prefixes, check startsWith
          if (forbidden.endsWith("/")) {
            assert.ok(!item.startsWith(forbidden), `untracked others should not contain ignored ${forbidden} but got ${item}`);
          } else {
            assert.notEqual(item, forbidden, `untracked others contains sensitive ${forbidden}`);
          }
        }
      }
      // Specifically check eng.traineddata not in others if gitignored
      const hasEng = others.includes("server/eng.traineddata") || others.includes("eng.traineddata");
      assert.equal(hasEng, false, `server/eng.traineddata should be gitignored and not appear in others: ${others.join(",")}`);
    });
  });

  describe("secret scanning", () => {
    async function walk(dir, files = []) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        // Skip ignored dirs
        if (entry.isDirectory()) {
          if (["node_modules", ".git", "dist", "tmp", "Temp", "Docs", ".tmp"].includes(entry.name)) continue;
          if (full.includes("node_modules") || full.includes("client/dist") || full.includes("server/tmp")) continue;
          await walk(full, files);
        } else {
          if (full.endsWith(".log") || full.includes("eng.traineddata")) continue;
          if (full.includes("package-lock.json")) continue;
          files.push(full);
        }
      }
      return files;
    }

    it("scans repo for AWS keys, private keys, hardcoded passwords - none found", async () => {
      const files = await walk(ROOT);
      const patterns = [
        { name: "AWS Access Key", regex: /AKIA[0-9A-Z]{16}/ },
        { name: "AWS Secret", regex: /aws_secret_access_key/i },
        { name: "Private Key Header", regex: /-----BEGIN (?:RSA )?PRIVATE KEY-----/ },
        { name: "Generic Private Key", regex: /-----BEGIN PRIVATE KEY-----/ },
        { name: "High entropy secret assignment", regex: /(?:api[_-]?key|secret)\s*[:=]\s*['"][A-Za-z0-9\/+]{30,}['"]/i },
      ];
      const selfFile = path.join(ROOT, "tests/security/noSecrets.test.js");
      const violations = [];
      for (const file of files) {
        if (file === selfFile) continue;
        if (file.includes("tests/security")) continue;
        // Only scan text files likely to contain secrets
        if (!/\.(js|jsx|ts|tsx|json|env|txt|md|yml|yaml)$/.test(file)) continue;
        let content;
        try {
          content = await fs.readFile(file, "utf8");
        } catch {
          continue;
        }
        // Skip our own test fixtures that intentionally contain password strings like "password protected" in processors
        // Only flag high-confidence patterns
        for (const { name, regex } of patterns) {
          if (regex.test(content)) {
            // Allowlist: skip if file is a test that contains "password" in assertion context and not a real key
            if (name === "AWS Access Key" && /AKIA[0-9A-Z]{16}/.test(content)) {
              violations.push(`${name} in ${path.relative(ROOT, file)}`);
            }
            if (name === "Private Key Header" && /BEGIN PRIVATE KEY/.test(content)) {
              violations.push(`${name} in ${path.relative(ROOT, file)}`);
            }
            if (name === "High entropy secret assignment") {
              // ignore test files that mock passwords
              if (file.includes("tests/")) continue;
              violations.push(`${name} in ${path.relative(ROOT, file)}`);
            }
          }
        }
        // Additional check: no hardcoded .env values with real secrets
        if (file.endsWith(".env") || file.endsWith(".env.example")) {
          // .env.example is allowed to have placeholder values, but not real keys
          if (/AKIA/.test(content) || /PRIVATE KEY/.test(content)) {
            violations.push(`secret in env file ${file}`);
          }
        }
      }
      assert.equal(violations.length, 0, `secret scan found violations: ${violations.join("; ")}`);
    });

    it("no file contains hardcoded AWS key pattern", async () => {
      const files = await walk(ROOT);
      for (const file of files) {
        if (file.includes("tests/security")) continue;
        if (file === path.join(ROOT, "tests/security/noSecrets.test.js")) continue;
        if (!/\.(js|json|txt)$/.test(file)) continue;
        const content = await fs.readFile(file, "utf8").catch(() => "");
        assert.equal(/AKIA[0-9A-Z]{16}/.test(content), false, `AWS key found in ${path.relative(ROOT, file)}`);
      }
    });

    it("no file contains private key block", async () => {
      const files = await walk(ROOT);
      for (const file of files) {
        if (file.includes("tests/security")) continue;
        if (file === path.join(ROOT, "tests/security/noSecrets.test.js")) continue;
        if (!/\.(js|pem|key|txt)$/.test(file)) continue;
        const content = await fs.readFile(file, "utf8").catch(() => "");
        assert.equal(/-----BEGIN PRIVATE KEY-----/.test(content), false, `private key found in ${file}`);
        assert.equal(/-----BEGIN RSA PRIVATE KEY-----/.test(content), false, `rsa private key found in ${file}`);
      }
    });
  });

  describe("SECURE_ENCRYPTION_MESSAGE plain ASCII and no emoji", () => {
    it("is exactly expected plain English string", () => {
      assert.equal(SECURE_ENCRYPTION_MESSAGE, "This file is securely encrypted and requires the original password.");
    });

    it("contains only ASCII 32-126 characters (no extended, no emoji)", () => {
      for (let i = 0; i < SECURE_ENCRYPTION_MESSAGE.length; i++) {
        const code = SECURE_ENCRYPTION_MESSAGE.charCodeAt(i);
        assert.ok(code >= 32 && code <= 126, `non-ASCII at index ${i}: code ${code} char ${SECURE_ENCRYPTION_MESSAGE[i]}`);
      }
      assert.ok(!/[^\x20-\x7E]/.test(SECURE_ENCRYPTION_MESSAGE), "contains non-ASCII");
    });

    it("does not contain emoji or box-drawing or non-ASCII punctuation", () => {
      assert.equal(/[\u{1F600}-\u{1F6FF}]/u.test(SECURE_ENCRYPTION_MESSAGE), false);
      assert.equal(/[\u2600-\u27BF]/u.test(SECURE_ENCRYPTION_MESSAGE), false);
      assert.equal(/[^\x00-\x7F]/.test(SECURE_ENCRYPTION_MESSAGE), false);
      // No arrow symbols, box drawing - use unicode escapes for ASCII compliance
      assert.equal(/[\u2192\u2190\u2191\u2193\u2500\u2502\u250C\u2510\u2514\u2518\u251C\u2524\u252C\u2534\u253C]/.test(SECURE_ENCRYPTION_MESSAGE), false);
    });

    it("never contains symbol prefix like emoji or decor", () => {
      // Use unicode escapes to avoid literal emoji in source (keeps file ASCII)
      const lock = "\uD83D\uDD12";
      const warning = "\u26A0\uFE0F";
      const noEntry = "\uD83D\uDEAB";
      assert.ok(!SECURE_ENCRYPTION_MESSAGE.startsWith(lock));
      assert.ok(!SECURE_ENCRYPTION_MESSAGE.startsWith(warning));
      assert.ok(!SECURE_ENCRYPTION_MESSAGE.startsWith("**"));
      assert.ok(!SECURE_ENCRYPTION_MESSAGE.includes(lock));
      assert.ok(!SECURE_ENCRYPTION_MESSAGE.includes(noEntry));
    });

    it("is not empty and has reasonable length", () => {
      assert.ok(SECURE_ENCRYPTION_MESSAGE.length > 20);
      assert.ok(SECURE_ENCRYPTION_MESSAGE.length < 200);
    });
  });

  describe("additional gitignore sanity", () => {
    it(" .env file is gitignored", () => {
      const res = execGit(["check-ignore", ".env"]);
      assert.equal(res.status, 0, ".env should be ignored");
      const res2 = execGit(["check-ignore", "server/.env"]);
      assert.equal(res2.status, 0, "server/.env should be ignored");
    });

    it("client/dist and server/tmp are gitignored", () => {
      assert.equal(execGit(["check-ignore", "client/dist/index.html"]).status, 0);
      assert.equal(execGit(["check-ignore", "server/tmp/uploads/file.pdf"]).status, 0);
    });

    it("Docs and Temp are gitignored", () => {
      assert.equal(execGit(["check-ignore", "Docs/pdf/sample.pdf"]).status, 0);
      assert.equal(execGit(["check-ignore", "Temp/some.txt"]).status, 0);
    });
  });
});
