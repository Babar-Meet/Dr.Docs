// Live-server integration test: boots the real production entry
// (server/src/index.js) as a child process on a random free port, drives
// it through plain HTTP the way the browser does (multipart upload),
// verifies real outputs and the frozen download rules, then kills the
// child and removes every fixture. Nothing here touches port 5000: the
// dev server can run at the same time.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const TMP_ROOT = path.join(
  os.tmpdir(),
  `drdocs-live-server-${Date.now()}-${process.pid}`,
);

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

async function makeRealPdf(dir, name, pages = 2) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([500, 300]);
    page.drawText(`Live page ${i + 1}`, { x: 40, y: 200, size: 30, font });
  }
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, await doc.save());
  return filePath;
}

function killChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  // Windows does not deliver signals the way Unix does; after a short
  // wait, fall back to the tree kill so no server outlives this test.
  if (process.platform === "win32") {
    const deadline = Date.now() + 3000;
    const interval = setInterval(() => {}, 100);
    const tryKill = () => {
      if (child.exitCode !== null || Date.now() > deadline) {
        clearInterval(interval);
        if (child.exitCode === null && process.platform === "win32") {
          try {
            execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
              stdio: "ignore",
            });
          } catch {
            // already gone
          }
          child.kill();
        }
      }
    };
    let checks = 0;
    const timer = setInterval(() => {
      checks += 1;
      tryKill();
      if (checks > 40) clearInterval(timer);
    }, 100);
  } else {
    child.kill("SIGKILL");
  }
}

describe("live server (real entry, real HTTP, self-cleaning)", () => {
  let client = null;
  let baseUrl = "";

  before(async () => {
    await fs.ensureDir(TMP_ROOT);
    const port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;
    client = spawn(
      process.execPath,
      [path.join(ROOT, "server", "src", "index.js")],
      {
        env: { ...process.env, PORT: String(port) },
        stdio: ["ignore", "ignore", "ignore"],
        windowsHide: true,
      },
    );

    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (client.exitCode !== null) {
        throw new Error(`live server exited early with ${client.exitCode}`);
      }
      try {
        const health = await (await fetch(`${baseUrl}/health`)).json();
        if (health.status === "ok") return;
      } catch {
        // not accepting connections yet
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error("live server never answered /health within 30s");
  });

  after(async () => {
    killChild(client);
    await fs.remove(TMP_ROOT);
  });

  it("boots the production entry and answers health on a fresh port", async () => {
    const health = await (await fetch(`${baseUrl}/health`)).json();
    assert.equal(health.status, "ok");
    assert.equal(health.service, "dr-docs");
  });

  it("refuses a bad operation over multipart with the frozen 400 shape", async () => {
    const res = await fetch(`${baseUrl}/process`, {
      method: "POST",
      body: new FormData(),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, "UNSUPPORTED_FILE");
    assert.equal(body.status, "failed");
  });

  it("compresses a real uploaded PDF end to end and the download is single-use", async () => {
    const source = await makeRealPdf(TMP_ROOT, "live.pdf", 2);
    const form = new FormData();
    form.append("operation", "compress");
    form.append(
      "files",
      new Blob([await fs.readFile(source)], { type: "application/pdf" }),
      "live.pdf",
    );

    const res = await fetch(`${baseUrl}/process`, {
      method: "POST",
      body: form,
    });
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.results?.length, 1, "one input must give one output");
    assert.equal(payload.downloadName, "live_compressed.pdf");

    const first = await fetch(baseUrl + payload.downloadUrl);
    assert.equal(first.status, 200);
    const bytes = Buffer.from(await first.arrayBuffer());
    assert.equal(
      bytes.toString("latin1", 0, 5),
      "%PDF-",
      "the fetched output must be a real PDF",
    );

    const second = await fetch(baseUrl + payload.downloadUrl);
    assert.equal(second.status, 404, "downloads are single-use; the id dies");
  });

  it("converts an uploaded PDF to text end to end (pure JS route)", async () => {
    const source = await makeRealPdf(TMP_ROOT, "words.pdf", 1);
    const form = new FormData();
    form.append("operation", "convert");
    form.append("targetFormat", "txt");
    form.append(
      "files",
      new Blob([await fs.readFile(source)], { type: "application/pdf" }),
      "words.pdf",
    );

    const res = await fetch(`${baseUrl}/process`, {
      method: "POST",
      body: form,
    });
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.downloadName, "words_processed.txt");

    const download = await fetch(baseUrl + payload.downloadUrl);
    assert.equal(download.status, 200);
    const text = await download.text();
    assert.ok(
      text.includes("Live page 1"),
      "the txt output must carry the drawn source text",
    );
  });
});
