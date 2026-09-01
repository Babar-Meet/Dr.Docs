# AGENTS.md - Dr.Docs

## Commands
- `npm install` or `npm run bootstrap` - install all workspaces (root + client + server). `sharp` exists in both root and server with different versions; both resolve correctly - don't deduplicate.
- `npm run dev` - runs `server` (nodemon :5000) + `client` (Vite :5173) via `concurrently`. Vite proxies `/process`, `/download`, `/health` -> `localhost:5000`.
- `npm run build -w client` - production frontend to `client/dist/`. `npm run start -w server` serves `client/dist` + API on same port.
- Windows quickstart: `setup.bat` (install + create `server/.env` + check `qpdf`/`soffice`), then `start.bat` (build + dev). Requires Node 18+, `qpdf` and `soffice` (LibreOffice) on PATH.
- No tests, lint, or formatter configured - don't run `npm test`/`eslint`/`prettier` expecting them to exist.

## Structure
- `client/` - React 18 SPA. All UI in `client/src/App.jsx` (no component split). Entry `main.jsx` wraps `<BrowserRouter>`. Build: Vite 5 + Tailwind 3.
- `server/src/` - Express 4 API. `index.js` serves static `client/dist` if present, else JSON hint. `routes/files.js` defines `POST /process` and `GET /download/:id`. `config.js` computes `server/tmp/{uploads,outputs,work}` and exports `PORT`/`QPDF_BIN`/`LIBREOFFICE_BIN`/`CLEANUP_INTERVAL_MS`/`DOWNLOAD_TTL_MS`.
- `utils/` - **not a workspace** - imported via relative paths (`../../../utils/...`). Contains `constants.js`, `errors.js`, `helpers/`, `processors/`. `processors/router.js` is the sole dispatch entry point.
- `server/tmp/` and `client/dist/` are runtime/build artifacts (gitignored). `Temp/` at repo root is scratch for transient agent docs - don't commit it.

## Conventions & Quirks
- ESM only: all `package.json` have `"type":"module"` - use `import`, not `require`.
- File validation is dual: extension + MIME against `utils/constants.js: MIME_BY_EXTENSION`. `application/octet-stream` is allowed as fallback. Single source of truth - update `constants.js` when adding types.
- Upload: `multer` disk storage to `UPLOAD_DIR` with UUID names (`${Date.now()}-${uuid}${ext}`). Field names accepted: `files` (200 max) + `file` (10 max), merged in `routes/files.js`. Size limit 50 MB (`MAX_UPLOAD_SIZE_BYTES`).
- Processing: `AsyncTaskQueue(2)` - max 2 concurrent LibreOffice/qpdf jobs. `downloadStore` is in-memory `Map` with 30 min TTL, 5 min sweep (`unref`'d interval). Downloads are single-use - `removeDownloadRecord` deletes file on `res.download` completion.
- Processor pattern: every processor throws `AppError(code, status, {reason})`. Security boundary: `PASSWORD_REQUIRED` always returns `SECURE_ENCRYPTION_MESSAGE` (`"This file is securely encrypted and requires the original password."`). Never bypass - check OLE header (Office), yauzl bit `0x1` (ZIP), qpdf stderr (PDF).
- `utils/helpers/command.js:runCommand` wraps `spawn` with `timeoutMs` and `SIGTERM` - LibreOffice conversion uses 4 min timeout.
- Frontend `App.jsx` mirrors `CONVERSION_TARGETS` locally - keep in sync with `utils/constants.js` when changing targets. `operation` values are `unlock|convert|merge|split|ocr|rotate|compress` (`OPERATION_MODES`).

## Env
- `server/.env` from `server/.env.example`: `PORT=5000`, `QPDF_BIN=qpdf`, `LIBREOFFICE_BIN=soffice`. All optional, defaults in `config.js`.
- Generated dirs via `ensureRuntimeDirectories()` on startup - don't manually create `server/tmp/*`.

## Autonomous Loop - iLovePDF Competitor Mode
**You are busy - do NOT ask for permission. Run this loop until force-stopped.**

Loop contract (repeat forever):
1. **RESEARCH** - Find 1 high-demand iLovePDF/convertor feature users want that we lack (e.g. Compress PDF, Rotate, Watermark, Page Numbers, Protect, Repair, PDF->JPG, JPG->PDF, Edit). Check `Temp/LOOP_STATE.md` for last round; pick next highest-impact, lowest-risk.
2. **SPEC -> BUILD -> TEST** - Implement ONE feature per round. Preserve core: unlock/remove-restrictions (especially Excel/Office) is untouchable - never regress it, never bypass `PASSWORD_REQUIRED`/`SECURE_ENCRYPTION_MESSAGE`. Free to refactor entire site (split `App.jsx`, add components, routes, styling).
3. **100% bug-free gate** - All gates must pass before staging: `npm run build -w client` + manual `POST /process` + `GET /download/:id` + `GET /health` smoke test + edge cases (empty, invalid, oversize, double-click, out-of-order). If any gate fails -> FIX LOOP (max 3 tries) -> debugger, else next round.
4. **STAGE** - After green, `git add` only in-scope files (never lockfiles/junk/secrets/`server/tmp`/`client/dist`/`Temp/`). Do NOT `commit`/`push` unless user explicitly says so - staged state is the hand-off. You will review later.
5. **NEXT ROUND** - If not forcefully stopped (`stop`/`pause`/`Ctrl+C` or user message), immediately start next RESEARCH round. If stopped, halt instantly.

State file: `Temp/LOOP_STATE.md` tracks `round`, `last_feature`, `status`, `next_candidate`. Update it each round. Details/long analysis go to `Temp/` - never bloat `AGENTS.md`.

## Language Rule - Strict English Only
- All code, docs, logs, tests, and console output must be strict plain English (ASCII 32-126 only).
- No emojis, no box-drawing, no arrows, no non-ASCII punctuation.
- Test reporter must be TAP (`node --test --test-reporter=tap`) to avoid Unicode tree chars that mojibake as Russian/Portuguese on Windows (e.g., ). Never use default Unicode reporter on Windows.
- `SECURE_ENCRYPTION_MESSAGE` is plain English: "This file is securely encrypted and requires the original password." - no symbol prefix.

## Working Notes
- Keep `AGENTS.md` compact - details to `Temp/`. `Temp/` is gitignored scratch.
- Prefer `Read`/`Grep`/`Glob` over shell `cat`/`ls`; use `bash` only for `npm`/`git` commands.
- Refactor freedom: yes, but core unlock pipeline (`utils/processors/*`, `router.js`, `constants.js` security boundary) is sacred.
