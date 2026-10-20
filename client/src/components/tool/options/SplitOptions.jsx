import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Scissors, X } from "lucide-react";
import Panel from "../../ui/Panel.jsx";
import { renderPdfThumbnails } from "../../../lib/pdfThumbs";
import {
  parseRangeParts,
  rangeRowReason,
  rangeRowStatus,
  rangesStringFromRows,
  firstPartIndexCoveringPage,
  fixedPartIndexForPage,
  fixedPartCount,
  nextCandidatePage,
  togglePagePart,
} from "../../../lib/pageRanges";

// The page tiles render at the Rotate preview width, from the same lazy
// pdf.js chunk. Pages past the raster cap show as number tiles and stay
// clickable in the parts mode, so the parts of a long document are still
// reachable.
const PREVIEW_WIDTH = 155;

const INPUT_CLASS =
  "w-[4.5rem] rounded-[5px] border border-borderStrong bg-deep px-2 py-2 " +
  "text-center font-mono text-[13px] text-content outline-none transition " +
  "placeholder:text-[#777777] hover:border-[#666666] focus:border-orange " +
  "focus:ring-2 focus:ring-orange/20";

export default function SplitOptions({
  pageRanges,
  setPageRanges,
  splitMode,
  setSplitMode,
  splitEvery,
  setSplitEvery,
  pdfPages,
  file,
}) {
  const [previews, setPreviews] = useState([]);
  const [previewError, setPreviewError] = useState("");
  const [previewComplete, setPreviewComplete] = useState(false);
  const loadedFileRef = useRef(null);
  const isFixedMode = splitMode === "fixed";

  // Preview mechanics copied from RotateOptions: start on file pick, restart
  // per file, never restart a finished job on later visits to the tab.
  useEffect(() => {
    if (!file) return;
    if (loadedFileRef.current === file && previewComplete) {
      return;
    }
    loadedFileRef.current = file;
    setPreviews([]);
    setPreviewError("");
    setPreviewComplete(false);
    let cancelled = false;

    renderPdfThumbnails(file, {
      targetWidth: PREVIEW_WIDTH,
      onEntry: (entry) => {
        if (cancelled) return;
        setPreviews((current) => [...current, entry]);
      },
    })
      .then(() => {
        if (cancelled) return;
        setPreviewComplete(true);
      })
      .catch(() => {
        if (cancelled) return;
        setPreviewError(
          "Preview is not available for this file. The parts below still work.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  const rows = useMemo(() => parseRangeParts(pageRanges), [pageRanges]);

  // The fixed-mode number, kept as text so the field behaves while it is
  // being typed into. One-based chunks: 2 pages per PDF on a 15 page file
  // makes 7 full parts plus a shorter eighth one.
  const every = Number.parseInt(splitEvery, 10);
  const everyValid = Number.isInteger(every) && every >= 1;
  const partsCreated = fixedPartCount(pdfPages, everyValid ? every : 0);
  const lastPartPages =
    pdfPages !== null && everyValid && pdfPages % every !== 0
      ? pdfPages % every
      : null;

  const write = (nextRows) => setPageRanges(rangesStringFromRows(nextRows));

  // Editing one field keeps the other field's text, and a row edited out of
  // its single-number shape becomes a range row, so nothing the user typed
  // is ever dropped on write-back.
  const editPart = (index, field, value) => {
    const next = { ...rows[index], [field]: value };
    next.hadDash = next.hadDash || next.fromText !== next.toText;
    write(rows.map((row, at) => (at === index ? next : row)));
  };

  const removePart = (index) => {
    write(rows.filter((_, at) => at !== index));
  };

  const addPart = () => {
    const candidate = nextCandidatePage(rows, pdfPages);
    write([
      ...rows,
      {
        fromText: String(candidate),
        toText: String(candidate),
        hadDash: false,
      },
    ]);
  };

  const pickPage = (page) => {
    const next = togglePagePart(rows, page, pdfPages);
    if (next !== null) {
      write(next);
    }
  };

  const invalidIndex = rows.findIndex(
    (row) => !rangeRowStatus(row, pdfPages).valid,
  );

  const badgeForPage = (page) => {
    if (isFixedMode) {
      return everyValid ? fixedPartIndexForPage(page, every) : -1;
    }
    return firstPartIndexCoveringPage(page, rows, pdfPages);
  };

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          Split Options
        </p>
        {pdfPages !== null && (
          <p className="font-body text-[11px] text-muted">
            {pdfPages} page{pdfPages === 1 ? "" : "s"}
          </p>
        )}
      </div>

      <div className="mt-2 flex gap-5 border-b border-borderStrong/70">
        <button
          type="button"
          onClick={() => setSplitMode("parts")}
          className={
            "pb-2 font-display text-[13px] font-bold transition " +
            (!isFixedMode
              ? "border-b-2 border-orange text-orange"
              : "border-transparent text-muted hover:text-content")
          }
        >
          Custom parts
        </button>
        <button
          type="button"
          onClick={() => setSplitMode("fixed")}
          className={
            "pb-2 font-display text-[13px] font-bold transition " +
            (isFixedMode
              ? "border-b-2 border-orange text-orange"
              : "border-transparent text-muted hover:text-content")
          }
        >
          Every N pages
        </button>
      </div>

      {!isFixedMode ? (
        <div className="mt-4">
          <p className="font-body text-[12px] text-muted">
            One row is one PDF. Part 1 takes the pages in its boxes, part 2
            the next, and so on, in that order.
          </p>

          {rows.length === 0 && (
            <p className="mt-3 rounded-[5px] bg-deep px-3 py-2 font-body text-xs text-muted">
              No parts yet: with nothing set, every page becomes its own PDF.
            </p>
          )}

          {rows.length > 0 && (
            <div className="mt-3 space-y-2">
              {rows.map((row, index) => {
                const valid = rangeRowStatus(row, pdfPages).valid;
                return (
                  <div
                    key={index}
                    className="flex items-center gap-2 rounded-[5px] border border-borderDark bg-deep px-3 py-2"
                  >
                    <span className="w-12 shrink-0 font-mono text-[11px] font-bold text-offWhite">
                      Part {index + 1}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={pdfPages ?? undefined}
                      value={row.fromText}
                      aria-label={`Part ${index + 1} first page`}
                      onChange={(event) =>
                        editPart(index, "fromText", event.target.value)
                      }
                      className={INPUT_CLASS + (valid ? "" : " border-error")}
                    />
                    <span className="font-body text-[12px] text-muted">to</span>
                    <input
                      type="number"
                      min={1}
                      max={pdfPages ?? undefined}
                      value={row.toText}
                      aria-label={`Part ${index + 1} last page`}
                      onChange={(event) =>
                        editPart(index, "toText", event.target.value)
                      }
                      className={INPUT_CLASS + (valid ? "" : " border-error")}
                    />
                    <button
                      type="button"
                      onClick={() => removePart(index)}
                      title={`Remove part ${index + 1}`}
                      aria-label={`Remove part ${index + 1}`}
                      className="ml-auto rounded-sm p-0.5 text-muted hover:text-error"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {invalidIndex !== -1 && (
            <p className="mt-2 font-body text-xs font-semibold text-orange">
              Part {invalidIndex + 1}:{" "}
              {rangeRowReason(rows[invalidIndex], pdfPages)}
            </p>
          )}

          <button
            type="button"
            onClick={addPart}
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-[5px] border border-borderStrong bg-deep px-4 py-2 font-display text-[13px] font-bold text-offWhite transition hover:bg-elevated hover:text-content"
          >
            <Plus className="h-4 w-4" />
            Add part
          </button>

          <p className="mt-3 font-body text-[12px] leading-normal text-muted">
            Click a page below to make it a part on its own, and click it
            again to remove it. Pages inside a bigger part are edited with
            the boxes above.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <span className="font-body text-[13px] font-semibold text-offWhite">
              Split every
            </span>
            <input
              type="number"
              min={1}
              value={splitEvery}
              aria-label="Pages per PDF"
              onChange={(event) => setSplitEvery(event.target.value)}
              className={INPUT_CLASS + (everyValid ? "" : " border-error")}
            />
            <span className="font-body text-[13px] text-muted">pages</span>
          </div>

          <p
            className={
              "mt-2 font-body text-[12px] " +
              (everyValid || `${splitEvery}`.trim() === ""
                ? "text-muted"
                : "font-semibold text-orange")
            }
          >
            {`${splitEvery}`.trim() === ""
              ? "Type how many pages go into one PDF."
              : !everyValid
                ? "Type a whole number of pages, 1 or more."
                : pdfPages === null
                  ? `Each PDF gets ${every} page${every === 1 ? "" : "s"}.`
                  : `Each PDF gets ${every} page${every === 1 ? "" : "s"}. ${
                      partsCreated === 1
                        ? "1 PDF will be created."
                        : `${partsCreated} PDFs will be created.`
                    }${
                      lastPartPages !== null
                        ? ` The last one takes ${lastPartPages}.`
                        : ""
                    }`}
          </p>

          <p className="mt-3 font-body text-[12px] leading-normal text-muted">
            The orange frames show which pages land in which PDF. Your custom
            parts from the other tab are kept and used again when you switch
            back.
          </p>
        </div>
      )}

      <div className="mt-4 border-t border-borderStrong/70 pt-3">
        {previewError && (
          <p className="mb-3 font-body text-xs font-semibold text-orange">
            {previewError}
          </p>
        )}

        {previews.length === 0 && !previewError && (
          <div className="flex items-center gap-3 py-6">
            <Scissors className="h-4 w-4 animate-spin text-muted" />
            <p className="font-body text-[13px] text-muted">
              Loading page preview...
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {previews.map((entry) => (
            <PartCard
              key={entry.page}
              entry={entry}
              coverIndex={badgeForPage(entry.page)}
              clickable={!isFixedMode}
              onPick={() => pickPage(entry.page)}
            />
          ))}
        </div>
      </div>
    </Panel>
  );
}

function PartCard({ entry, coverIndex, clickable, onPick }) {
  const covered = coverIndex !== -1;
  const shared =
    "relative w-[172px] rounded-[6px] border p-2 text-left transition " +
    (covered
      ? "border-orange bg-successBg/40"
      : clickable
        ? "border-borderStrong bg-deep hover:bg-elevated"
        : "border-borderStrong bg-deep");

  const inner = (
    <>
      <span className="absolute left-2 top-1.5 font-mono text-[10px] font-bold text-muted">
        {entry.page}
      </span>

      <div className="flex h-[150px] items-center justify-center overflow-hidden">
        {entry.thumbnail ? (
          <img
            src={entry.thumbnail}
            alt={`Page ${entry.page}`}
            draggable={false}
            className="max-h-full max-w-full"
          />
        ) : (
          <div className="flex h-full w-28 items-center justify-center rounded-[5px] bg-elevated font-mono text-[13px] text-muted">
            {entry.page}
          </div>
        )}
      </div>

      {/* Fixed badge slot: covered pages carry the part number, the rest
          keep the slot empty so heights never jump. */}
      <p
        className={
          "mt-1 h-[15px] text-center font-display text-[10px] font-bold uppercase leading-[15px] tracking-[0.06em] text-orange " +
          (covered ? "" : "invisible")
        }
      >
        {covered ? `Part ${coverIndex}` : "placeholder"}
      </p>
    </>
  );

  if (!clickable) {
    // In the fixed mode the tiles are read-only badges: the chunk size owns
    // the mapping, so a click would promise something it cannot do.
    return (
      <div className={shared + " cursor-default"} title={`Page ${entry.page}`}>
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onPick}
      title={
        covered
          ? `Remove page ${entry.page} from part ${coverIndex}`
          : `Make page ${entry.page} a part on its own`
      }
      aria-label={
        covered ? `Unpick page ${entry.page}` : `Pick page ${entry.page}`
      }
      className={shared}
    >
      {inner}
    </button>
  );
}
