# AGENTS.md - Dr.Docs

## DESIGN SYSTEM - MANDATORY FIRST READ

**All agents, harnesses, and AI models MUST read the design system before any UI, styling, or frontend work.**

- Single source: `DESIGN.md` - canonical Midnight Orange Design System (high-contrast dark-first: Ink Black #0B0B0B, Orange #FF9900, Inter + JetBrains Mono)
- Rule: Before touching `client/`, `App.jsx`, `index.css`, `tailwind.config.js`, or any component, read `DESIGN.md` end-to-end. Follow its colors, typography, spacing, radius, elevation, and component specs exactly. Core formula: Black structure + white content + gray hierarchy + orange action.
- `DESIGN.md` is the ONLY theme file — do not create `THEME.md` or other duplicates. This keeps context window small (one file, not two). If a harness looks for `THEME.md`, point it to `DESIGN.md` via this AGENTS.md.
- If no `DESIGN.md` change is requested, do not alter the design system.

## Commands
- `npm install` or `npm run bootstrap` - install all workspaces (root + client + server). `sharp` exists in both root and server with different versions; both resolve correctly - don't deduplicate.
- `npm run dev` - runs `server` (nodemon :5000) + `client` (Vite :5173) via `concurrently`. Vite proxies `/process`, `/download`, `/health` -> `localhost:5000`.
- `npm run build -w client` - production frontend to `client/dist/`. `npm run start -w server` serves `client/dist` + API on same port.
- Windows quickstart: `setup.bat` (install + create `server/.env` + check `qpdf`/`soffice`), then `start.bat` (build + dev). Requires Node 18+, `qpdf` and `soffice` (LibreOffice) on PATH.
- No tests, lint, or formatter configured - don't run `npm test`/`eslint`/`prettier` expecting them to exist.

## Structure
- `DESIGN.md` - Midnight Orange Design System. Single source of truth for all UI decisions. Every model reads this via AGENTS.md.
- `client/` - React 18 SPA. All UI in `client/src/App.jsx` (no component split). Entry `main.jsx` wraps `<BrowserRouter>`. Build: Vite 5 + Tailwind 3. Must follow `DESIGN.md`.
- `server/src/` - Express 4 API. `index.js` serves static `client/dist` if present, else JSON hint. `routes/files.js` defines `POST /process` and `GET /download/:id`. `config.js` computes `server/tmp/{uploads,outputs,work}` and exports `PORT`/`QPDF_BIN`/`LIBREOFFICE_BIN`/`CLEANUP_INTERVAL_MS`/`DOWNLOAD_TTL_MS`.
- `utils/` - **not a workspace** - imported via relative paths (`../../../utils/...`). Contains `constants.js`, `errors.js`, `helpers/`, `processors/`. `processors/router.js` is the sole dispatch entry point.
- `server/tmp/` and `client/dist/` are runtime/build artifacts (gitignored). `Temp/` at repo root is scratch for transient agent docs - don't commit it.

## Conventions & Quirks
- ESM only: all `package.json` have `"type":"module"` - use `import`, not `require`.
- Design system is sacred for UI: use Ink Black #0B0B0B background, Panel #1C1C1C cards, Border #333333/#454545, Orange #FF9900 only for primary actions/active states, White #FFFFFF for content, Inter 700 for headings/buttons, JetBrains Mono for mono. No glassmorphism, no gradients, no pill-everything.
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
2. **SPEC -> BUILD -> TEST** - Implement ONE feature per round. Preserve core: unlock/remove-restrictions (especially Excel/Office) is untouchable - never regress it, never bypass `PASSWORD_REQUIRED`/`SECURE_ENCRYPTION_MESSAGE`. Free to refactor entire site (split `App.jsx`, add components, routes, styling) but any new UI MUST follow `DESIGN.md` (Midnight Orange).
3. **100% bug-free gate** - All gates must pass before staging: `npm run build -w client` + manual `POST /process` + `GET /download/:id` + `GET /health` smoke test + edge cases (empty, invalid, oversize, double-click, out-of-order). If any gate fails -> FIX LOOP (max 3 tries) -> debugger, else next round.
4. **STAGE** - After green, `git add` only in-scope files (never lockfiles/junk/secrets/`server/tmp`/`client/dist`/`Temp/`). Do NOT `commit`/`push` unless user explicitly says so - staged state is the hand-off. You will review later. Include `DESIGN.md` if it changed.
5. **NEXT ROUND** - If not forcefully stopped (`stop`/`pause`/`Ctrl+C` or user message), immediately start next RESEARCH round. If stopped, halt instantly.

State file: `Temp/LOOP_STATE.md` tracks `round`, `last_feature`, `status`, `next_candidate`. Update it each round. Details/long analysis go to `Temp/` - never bloat `AGENTS.md`.

## Language Rule - Strict English Only
- All code, docs, logs, tests, and console output must be strict plain English (ASCII 32-126 only). Professional, simple, direct - no AI slop.
- No emojis, no icons in headings/code/logs/tests, no box-drawing, no arrows, no smart quotes, no ellipsis glyphs, no non-ASCII punctuation.
- No em dashes or en dashes - use plain hyphen `-` or comma. Bad: "fast -- secure" Good: "fast, secure, and private" or "Pages 1-10".
- No AI banners like "AI Generated Documentation" or "Generated by AI". Start with purpose, not a banner.
- No AI cliches or purple prose: avoid delve, tapestry, unlock the power, digital landscape, leverage, embark, realm, elevate, seamless, revolutionary, cutting-edge, incredibly robust. Prefer measurable facts: tool names, limits, ports, sizes.
- No over-formatting, no excessive nesting, no emoji per heading, no 4-level bullets for 2 ideas. Keep headings plain, bold only for terms/paths, lists max 2 levels.
- Keep tone consistent, present tense, one idea per sentence. No filler adjectives (very, extremely, truly). Use numbers: "Text PDFs shrink 10-40%".
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
[ ] Grep check passes: `grep -r -P "[^\x00-\x7F]" --include="*.md" --include="*.js" --include="*.jsx" .` returns no results (or PowerShell Select-String "[^\x00-\x7F]")

## Working Notes
- Keep `AGENTS.md` compact - details to `Temp/`. `Temp/` is gitignored scratch.
- Prefer `Read`/`Grep`/`Glob` over shell `cat`/`ls`; use `bash` only for `npm`/`git` commands.
- Refactor freedom: yes, but core unlock pipeline (`utils/processors/*`, `router.js`, `constants.js` security boundary) is sacred.
- Theme freedom: UI must follow `DESIGN.md` (Midnight Orange). Do not introduce new palette or fonts without updating `DESIGN.md`.
