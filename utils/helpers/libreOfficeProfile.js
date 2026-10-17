import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import fs from "fs-extra";
import { runCommand } from "./command.js";

// LibreOffice serves every invocation that shares one -env:UserInstallation profile
// through a single running instance. Two conversions started at the same time without
// that argument share the default profile, so the second soffice collides with the
// first: it exits non-zero or writes no output at all.
//
// Each Node process therefore owns one profile root, and every concurrent conversion
// inside that process borrows a slot from the pool below. A slot is reused as soon as
// its conversion has finished, so a LibreOffice profile is populated once per slot
// instead of once per conversion, and two conversions never share a slot.
const PROFILE_ROOT = path.join(os.tmpdir(), "drdocs-libreoffice-profiles");
const PROCESS_ROOT = path.join(
  PROFILE_ROOT,
  `${process.pid}-${crypto.randomBytes(6).toString("hex")}`,
);
const PROCESS_ROOT_NAME = /^(\d+)-[0-9a-f]{12}$/;

const slots = [];
let processRootReady = null;
let processRootUsed = false;

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

// A killed or crashed process leaves its profile root behind. Anything whose owning
// pid is gone is dead weight, so the next process to start removes it.
async function removeAbandonedProfileRoots() {
  let entries;
  try {
    entries = await fs.readdir(PROFILE_ROOT, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const match = PROCESS_ROOT_NAME.exec(entry.name);
    if (!entry.isDirectory() || !match) {
      continue;
    }

    const ownerPid = Number(match[1]);
    if (ownerPid === process.pid || isPidAlive(ownerPid)) {
      continue;
    }

    try {
      await fs.remove(path.join(PROFILE_ROOT, entry.name));
    } catch {
      // Another process may be removing the same abandoned root.
    }
  }
}

// Resolves true when this process can hand out profile slots. A temp directory that cannot
// be written to is not fatal: the caller then runs the conversion the way it always did,
// with soffice on its default profile, instead of failing every conversion outright.
function ensureProcessRoot() {
  if (!processRootReady) {
    processRootReady = fs
      .ensureDir(PROCESS_ROOT)
      .then(() => {
        processRootUsed = true;
        void removeAbandonedProfileRoots().catch(() => {});
        return true;
      })
      .catch(() => false);
  }

  return processRootReady;
}

function acquireSlot() {
  const idle = slots.find((slot) => !slot.busy);
  if (idle) {
    idle.busy = true;
    return idle;
  }

  const slot = { dir: path.join(PROCESS_ROOT, `slot-${slots.length}`), busy: true };
  slots.push(slot);
  return slot;
}

function releaseSlot(slot) {
  slot.busy = false;
}

export async function withLibreOfficeProfile(run) {
  const profilesAvailable = await ensureProcessRoot();
  const slot = profilesAvailable ? acquireSlot() : null;

  try {
    return await run({
      profileArgs: slot
        ? [`-env:UserInstallation=${pathToFileURL(slot.dir).href}`]
        : [],
    });
  } finally {
    if (slot) {
      releaseSlot(slot);
    }
  }
}

// Building a slot's profile costs about 13 seconds the first time a conversion touches it;
// every conversion after that reuses the same profile in about 1.5 seconds. Each process owns
// a fresh profile root, so the first conversion in a new server process pays that 13 seconds
// again, which a nodemon restart makes a person pay repeatedly. Running one throwaway
// conversion at boot fills the first slot, so the first conversion a person runs is warm.
const WARM_UP_TIMEOUT_MS = 120000;

// Best effort, never throws: returns true when a slot was warmed, false when soffice is
// missing or the temp directory cannot be written. A false result changes nothing, the
// caller then behaves exactly as it did before the warm-up existed.
export async function warmUpLibreOfficeProfile(libreOfficeBin) {
  if (!libreOfficeBin || !(await ensureProcessRoot())) {
    return false;
  }

  const workDir = path.join(PROCESS_ROOT, "warm-up");
  const inputPath = path.join(workDir, "warm-up.txt");

  try {
    await fs.ensureDir(workDir);
    // A text document is the cheapest input that still drives a full conversion, so the
    // profile is populated exactly the way a real conversion populates it.
    await fs.writeFile(inputPath, "LibreOffice profile warm-up.\n");

    // Same flags as convertWithLibreOffice, so the profile left behind matches the one a
    // real conversion expects. The slot is released by withLibreOfficeProfile when this ends.
    await withLibreOfficeProfile(({ profileArgs }) =>
      runCommand(
        libreOfficeBin,
        [
          ...profileArgs,
          "--headless",
          "--convert-to",
          "pdf",
          "--outdir",
          workDir,
          inputPath,
        ],
        { timeoutMs: WARM_UP_TIMEOUT_MS },
      ),
    );

    return true;
  } catch {
    return false;
  } finally {
    await fs.remove(workDir).catch(() => {});
  }
}

process.once("exit", () => {
  if (!processRootUsed) {
    return;
  }

  try {
    fs.removeSync(PROCESS_ROOT);
  } catch {
    // The directory outlives this process only if a file is still locked by soffice.
  }
});
