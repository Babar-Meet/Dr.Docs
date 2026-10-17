# AGENTS.md - Dr.Docs

## DESIGN SYSTEM - MANDATORY FIRST READ

**All agents, harnesses, and AI models MUST read the design system before any UI, styling, or frontend work.**

- Single source: `DESIGN.md` - canonical Midnight Orange Design System (high-contrast dark-first: Ink Black #0B0B0B, Orange #FF9900, Inter + JetBrains Mono)
- Rule: Before touching `client/`, `App.jsx`, `index.css`, `tailwind.config.js`, or any component, read `DESIGN.md` end-to-end. Follow its colors, typography, spacing, radius, elevation, and component specs exactly. Core formula: Black structure + white content + gray hierarchy + orange action.
- `DESIGN.md` is the ONLY theme spec file - do not create `THEME.md` or other duplicates. This keeps context window small (one file, not two). If a harness looks for `THEME.md`, point it to `DESIGN.md` via this AGENTS.md. The tokens themselves live in `client/src/index.css` (CSS variables) and `client/tailwind.config.js` (color and font mapping); the `DESIGN.md` Implementation section names the CSS variables in `client/src/index.css` and says Tailwind colors use `var(--ink)` etc.
- If no `DESIGN.md` change is requested, do not alter the design system.

## FROZEN CORE CONTRACT - READ BEFORE ANY CHANGE

Every shipped tool and its exact behaviour is frozen: the original seven, plus `repair` that shipped as the eighth. This section is the contract, and it outranks refactor freedom. Read it before touching anything under `utils/`, `server/src/routes/`, `server/src/services/`, or `client/src/App.jsx`.

**Rule: additive only.** New work adds a new operation, a new optional request field, a new UI tool, or a new option whose default reproduces today's behaviour. Never change an existing operation's output, error message, status code, output filename pattern, accepted input, or default. If a change cannot be made additively, it is a proposal to the owner, not a commit.

Operations (`OPERATION_MODES`, `utils/constants.js:52`): `unlock` (default when the field is absent), `convert`, `merge`, `split`, `ocr`, `rotate`, `compress`, `repair`.

Per operation, frozen behaviour:
- `unlock` keeps the input extension. PDF: `qpdf --decrypt`; when qpdf answers `file is not encrypted` the input is copied through and the call still succeeds. DOCX: strip `w:documentProtection` and `w:writeProtection` from `word/settings.xml`. PPTX: strip `p:modifyVerifier` and `p:writeProtection` in `ppt/*.xml`. XLSX: delete `sheetProtection`. ZIP: rebuild without encrypted entries. Any other extension: `UNSUPPORTED_FILE` 400.
- `convert` needs `targetFormat`. Images go through `sharp` (EXIF rotate applied, out jpg/png/webp/avif/tiff, image to pdf through `pdf-lib`). Everything else goes through `soffice --headless --convert-to` with a 4 minute timeout. Valid pairs are exactly `CONVERSION_TARGETS`.
- `merge` needs two or more files and rejects ZIP. Every input becomes a PDF first (image through `pdf-lib`, Office through `soffice`), then `pdf-lib` merges. Output is `merged_files_processed.pdf`, or DOCX when `targetFormat` is docx; only PDF and DOCX are accepted.
- `split` takes exactly one PDF and page ranges like `1-3,5,7-10`. Part names are `<base>_part_<n>_page_<x>.pdf` and `<base>_part_<n>_pages_<a>-<b>.pdf`.
- `rotate` takes exactly one PDF, angle `90|180|270` (default 90), pages `all` (default) or `1,3-5,8`, applied with `pdf-lib`.
- `compress` takes one or more PDFs and is lossless: `qpdf --linearize --object-streams=generate --stream-data=compress`. Output size depends on the source file. Any lossy level must arrive as a new opt-in option; the default stays this exact command.
- `ocr` writes `.txt`: PDF through `pdf-parse`, DOCX through `mammoth`, XLSX through `exceljs`, PPTX by parsing `a:t`, images through `tesseract.js` with `eng`.
- `repair` keeps the input extension. PDF: `qpdf --linearize`; a repaired non-empty output written alongside qpdf exit code 3 counts as success. DOCX and PPTX: package validated and rewritten. XLSX: workbook reloaded and rewritten. ZIP: validated and rebuilt. JPG and PNG: decoded and re-encoded. A password-protected PDF returns `PASSWORD_REQUIRED` with `SECURE_ENCRYPTION_MESSAGE`, never `FILE_CORRUPTED`; strong encryption is never bypassed on any type.

Contract around them:
- Errors: `PASSWORD_REQUIRED` 400, `UNSUPPORTED_FILE` 400, `FILE_CORRUPTED` 400, `FILE_TOO_LARGE` 400, `PROCESSING_FAILED` 500 and 404. `PASSWORD_REQUIRED` always carries `SECURE_ENCRYPTION_MESSAGE` as its message, and `errorHandler.js` re-emits that message when it matches.
- Password and DRM: never bypass, never guess, never crack, never add a password prompt to a tool that lacks one. Every detection site stays exactly where it is (OLE header, yauzl bit `0x1`, qpdf stderr). This is the product's core promise.
- Uploads: `multipart/form-data`, `files` (200 max) and `file` (10 max) merged, 50MB per file, extension plus MIME against `MIME_BY_EXTENSION`, with `application/octet-stream` and a missing or empty MIME accepted as fallbacks.
- Response shape: `results[]` of `{downloadId, downloadName, downloadUrl, detectedType, message}`, plus `downloadId`/`downloadUrl` for the first result and `batchDownloadId`/`batchDownloadUrl` when more than one output exists. The frontend reads these names; do not rename them.
- Runtime: `AsyncTaskQueue(2)` wraps every job; `downloadStore` is an in-memory `Map` with a 30 minute TTL, a 5 minute sweep, and single-use downloads; uploads and the per-job work directory are deleted in a `finally`. No database, no auth, no accounts, no analytics.
- Paths: no uploaded filename reaches a path except through `sanitizeBaseName`, and it is always appended to a server-chosen base. Outputs are flat in `OUTPUT_DIR`.
- Network: two outbound requests only, the Google Fonts stylesheet and the Tesseract `eng` model. Nothing else may reach the network.
- UI: `DESIGN.md` is mandatory, both themes (`midnight`, `white`) stay, Lucide icons only, no new palette or font.

Enforcement: `tests/` pins this, and every new tool arrives with its own tests. Before changing a frozen path run `npm test` and `npm run build -w client`. A change that alters any behaviour above without the owner saying so is a defect, not a refactor.

## Commands
- `npm install` installs root + client + server. `npm run bootstrap` is `npm install --workspaces`: client + server only, root deps (`concurrently`, `sharp`) skipped, so run `npm install` at least once first. `sharp` is declared twice, root 0.34.5 and server 0.33.5; only the root copy loads: the only importer outside `tests/` is `utils/processors/imageProcessor.js`, and the test files that import sharp resolve to the root copy too.
- `npm run dev` - runs `server` (nodemon :5000) + `client` (Vite :5173) via `concurrently`. Vite proxies `/process`, `/download`, `/health` -> `localhost:5000`.
- `npm run build -w client` - production frontend to `client/dist/`. `npm run start -w server` serves `client/dist` + API on same port.
- Windows quickstart: `setup.bat` (install + create `server/.env` + check `qpdf`/`soffice`), then `start.bat` (build + dev). Requires `qpdf` and `soffice` (LibreOffice) on PATH. No manifest declares an `engines` field: Node 18.17+ is the install and run floor, because `sharp` (a server runtime import) declares it and 18.17 is the highest minimum in the tree, so 20.0-20.2 is excluded too; `build` alone only needs 18.0 (Vite 5 allows 18.0). `npm test` needs Node 21+ because the test script passes `tests/**/*.test.js` as its final argument and Node, not the shell, expands it; glob support for `node --test` landed in v21.0.0 and is not in any earlier line.
- Tests exist: `npm test` (node:test, TAP reporter) and `npm run test:watch`, 23 tracked files under `tests/` (477 tests in the 2026-10-17 run; re-measure, do not trust the count). No lint or formatter configured - do not expect `eslint` or `prettier`.

## Structure
- `DESIGN.md` - Midnight Orange Design System. Single source of truth for all UI decisions. Every model reads this via AGENTS.md.
- `client/` - React 18 SPA. All UI in `client/src/App.jsx` (no component split). Entry `main.jsx` wraps `<BrowserRouter>`. Build: Vite 5 + Tailwind 3. Must follow `DESIGN.md`.
- `server/src/` - Express 4 API. `index.js` serves static `client/dist` when `client/dist/index.html` exists, else a JSON hint on `/`. `routes/files.js` defines `POST /process` and `GET /download/:id`. `config.js` computes `server/tmp/{uploads,outputs,work}` and exports `SERVER_ROOT`/`TMP_ROOT`/`UPLOAD_DIR`/`OUTPUT_DIR`/`WORK_DIR`/`PORT`/`QPDF_BIN`/`LIBREOFFICE_BIN`/`CLEANUP_INTERVAL_MS`/`DOWNLOAD_TTL_MS` + `ensureRuntimeDirectories`.
- `utils/` - **not a workspace** - imported via relative paths (`../../../utils/...`). Contains `constants.js`, `errors.js`, `helpers/`, `processors/`. `processors/router.js` is the sole dispatch entry point.
- `tests/` - **not a workspace** - node:test TAP suite (contract, helpers, processors, server routes/middleware/services, security). Run from the repo root with `npm test`.
- `server/tmp/` and `client/dist/` are runtime/build artifacts (gitignored). `Temp/` at repo root is scratch for transient agent docs - don't commit it.

## Conventions & Quirks
- ESM only: all `package.json` have `"type":"module"` - use `import`, not `require`.
- Design system is sacred for UI: use Ink Black #0B0B0B background, Panel #1C1C1C cards, Border #333333/#454545, Orange #FF9900 only for primary actions/active states, White #FFFFFF for content, Inter 700 for headings/buttons, JetBrains Mono for mono. Those are the Midnight tokens (`data-theme="midnight"`), the default and canonical theme; a light theme (`data-theme="white"`) also ships, so keep both and do not treat the light one as a violation. No glassmorphism, no gradients, no pill-everything.
- File validation: extension + MIME against `utils/constants.js: MIME_BY_EXTENSION`, with two allowances: `application/octet-stream` is accepted as fallback, and a missing or empty MIME is accepted, so the extension alone decides. Single source of truth - update `constants.js` when adding types.
- Upload: `multer` disk storage to `UPLOAD_DIR` with UUID names (`${Date.now()}-${uuid}${ext}`). Field names accepted: `files` (200 max) + `file` (10 max), merged in `routes/files.js`. Size limit 50 MB (`MAX_UPLOAD_SIZE_BYTES`).
- Processing: `AsyncTaskQueue(2)` - max 2 concurrent LibreOffice/qpdf jobs. `downloadStore` is in-memory `Map` with 30 min TTL, 5 min sweep (`unref`'d interval). Downloads are single-use - `removeDownloadRecord` deletes file on `res.download` completion.
- Processor pattern: processors throw `new AppError(message, code, statusCode, details)`, for example `new AppError("File corrupted", "FILE_CORRUPTED", 400, { reason })`. Security boundary: every `PASSWORD_REQUIRED` site throws with `SECURE_ENCRYPTION_MESSAGE` as the message (`"This file is securely encrypted and requires the original password."`), and `errorHandler.js` re-emits that message when it matches, otherwise it falls back to `Password required`. Never bypass - check OLE header (Office), yauzl bit `0x1` (ZIP), qpdf stderr (PDF).
- `utils/helpers/command.js:runCommand` wraps `spawn` with `timeoutMs` and `SIGTERM` - LibreOffice conversion uses 4 min timeout.
- Frontend `App.jsx` mirrors `CONVERSION_TARGETS` locally - keep in sync with `utils/constants.js` when changing targets. `operation` values are `unlock|convert|merge|split|ocr|rotate|compress|repair` (`OPERATION_MODES`).

## Env
- Vars reach the process through the real process environment only - `config.js` reads bare `process.env`. Nothing loads `server/.env`: no dotenv dependency, no `process.loadEnvFile`, no `--env-file` flag in any script. `setup.bat` copies `server/.env.example` to `server/.env`, and that file is inert until a loader exists, so setting a var there changes nothing. Defaults: `PORT=5000`, `QPDF_BIN=qpdf`, `LIBREOFFICE_BIN=soffice` (`config.js:14-16`).
- Generated dirs via `ensureRuntimeDirectories()` on startup - don't manually create `server/tmp/*`.

## Autonomous Loop - iLovePDF Competitor Mode
**You are busy - do NOT ask for permission. Run this loop until force-stopped.**

Loop contract (repeat forever):
1. **RESEARCH** - Find 1 high-demand iLovePDF/convertor feature users want that we lack (e.g. Watermark, Page Numbers, Protect, PDF->JPG, Edit; Repair shipped as the eighth operation, so the `repairPdf`, `repairImage`, `repairXlsx`, `repairOfficeDocument` and `repairZip` processors are now wired into the router). Compress, Rotate, JPG->PDF and Repair are already shipped - do not pick them. Check `Temp/LOOP_STATE.md` for last round (create it on the first round if it is missing); pick next highest-impact, lowest-risk.
2. **SPEC -> BUILD -> TEST** - Implement ONE feature per round. Preserve core: unlock/remove-restrictions (especially Excel/Office) is untouchable - never regress it, never bypass `PASSWORD_REQUIRED`/`SECURE_ENCRYPTION_MESSAGE`. Free to refactor entire site (split `App.jsx`, add components, routes, styling) but any new UI MUST follow `DESIGN.md` (Midnight Orange).
3. **100% bug-free gate** - All gates must pass before staging: `npm test` (TAP, must show `# fail 0`) + `npm run build -w client` + manual `POST /process` + `GET /download/:id` + `GET /health` smoke test + edge cases (empty, invalid, oversize, double-click, out-of-order). If any gate fails -> FIX LOOP (max 3 tries) -> debugger, else next round.
4. **STAGE** - After green, `git add` only in-scope files (never `package-lock.json` or any other lockfile, since `.gitignore` has no lockfile entry; never junk/secrets; never `server/tmp`/`client/dist`/`Temp`/`Docs`/`.env`/`*.log`/`eng.traineddata`/`node_modules`, all matched by `.gitignore`; and never `git add .`, which stages untracked non-ignored dirs such as `.opencode/`). Do NOT `commit`/`push` unless user explicitly says so - staged state is the hand-off. You will review later. Include `DESIGN.md` if it changed.
5. **NEXT ROUND** - If not forcefully stopped (`stop`/`pause`/`Ctrl+C` or user message), immediately start next RESEARCH round. If stopped, halt instantly.

State file: `Temp/LOOP_STATE.md` tracks `round`, `last_feature`, `status`, `next_candidate`. Update it each round. `Temp/` is gitignored on purpose (`tests/security/` asserts `Temp/` is never tracked), so loop state stays on the local disk and does not survive a clean checkout. Details/long analysis go to `Temp/` - never bloat `AGENTS.md`.

## Language Rule - Strict English Only
- All code, docs, logs, tests, and console output must be strict plain English (ASCII 32-126 only). Professional, simple, direct - no AI slop.
- No emojis, no icons in headings/code/logs/tests, no box-drawing, no arrows, no smart quotes, no ellipsis glyphs, no non-ASCII punctuation.
- No em dashes or en dashes - use plain hyphen `-` or comma. Bad: "fast -- secure" Good: "fast, secure, and private" or "Pages 1-10".
- No AI banners like "AI Generated Documentation" or "Generated by AI". Start with purpose, not a banner.
- No AI cliches or purple prose: avoid delve, tapestry, unlock the power, digital landscape, leverage, embark, realm, elevate, seamless, revolutionary, cutting-edge, incredibly robust. Prefer measurable facts: tool names, limits, ports, sizes.
- No over-formatting, no excessive nesting, no emoji per heading, no 4-level bullets for 2 ideas. Keep headings plain, bold only for terms/paths, lists max 2 levels.
- Keep tone consistent, present tense, one idea per sentence. No filler adjectives (very, extremely, truly). Use measured numbers only: "50MB per file", "2 concurrent", "30 minute TTL". Do not invent a percentage; if nothing measured it, say the result depends on the source file.
- Test reporter must be TAP (`node --test --test-reporter=tap`) to avoid Unicode tree chars that mojibake as Russian/Portuguese on Windows. Never use default Unicode reporter on Windows.
- `SECURE_ENCRYPTION_MESSAGE` is plain English: "This file is securely encrypted and requires the original password." - no symbol prefix.
- Windows mojibake example: box-drawing showed as garbled chars on Windows - that is why ASCII only.

Professional Simple English Checklist - every change must pass:
[ ] ASCII only 32-126: no em dash, en dash, smart quotes, ellipsis glyph, arrows, box-drawing, emoji
[ ] No emoji or icons in headings, code, logs, or tests
[ ] No AI banner like "AI Generated" or "Generated by AI"
[ ] Tone plain and consistent, present tense, one idea per sentence
[ ] No AI cliches: delve, unlock the power, digital landscape, tapestry, leverage, embark, realm, elevate, seamless, revolutionary, cutting-edge
[ ] No purple prose or filler adjectives - keep measurable facts (tool names, limits, sizes, ports)
[ ] Formatting minimal: headings plain, bold only for terms/paths, lists max 2 levels, no emoji per heading
[ ] No excessive sections: if doc > 2 pages, split or trim
[ ] TAP reporter stays on, no Unicode test trees
[ ] Keep "Hard is good" line in README.md if touching it, else no motto needed
[ ] Grep check passes: `git grep -n -P "[^\x00-\x7F]"` prints nothing (exit 1 is the pass state). Same command in PowerShell or bash. No pathspec, so it covers every tracked file, including the extensionless `LICENSE`, `.gitignore` and `server/.env.example`; `git grep` reads tracked files only, so `node_modules/`, `Temp/`, `Docs/` and `client/dist/` are out of scope by construction.

## Working Notes
- Keep `AGENTS.md` compact - details to `Temp/`. `Temp/` is gitignored scratch.
- Prefer `Read`/`Grep`/`Glob` over shell `cat`/`ls`; use `bash` only for `npm`/`git` commands.
- Refactor freedom: yes, but core unlock pipeline (`utils/processors/*`, `router.js`, `constants.js` security boundary) is sacred.
- Theme freedom: UI must follow `DESIGN.md` (Midnight Orange). Two themes are selectable, `midnight` and `white`; keep both. `client/src/index.css` still carries an unreachable `[data-theme="amoled"]` block that the `DESIGN.md` Theme Toggle section documents as still shipping, so do not delete it and do not add a third option. Do not introduce new palette or fonts without updating `DESIGN.md`.
