import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, RotateCw, X } from "lucide-react";
import Panel from "../../ui/Panel.jsx";
import { renderPdfThumbnails } from "../../../lib/pdfThumbs";

// One card per page. The thumbnail carries the page's existing rotation plus
// the user's picks; a CSS transform turns it live with every press.
const PREVIEW_WIDTH = 155;

const SUMMARY_BY_DELTA = (delta) =>
  delta === 270 ? "Left" : delta === 180 ? "Half turn" : "Right";

function pageTransform(baseRotation, delta) {
  const net = (baseRotation + (delta || 0)) % 360;
  const needsShrink = net === 90 || net === 270;
  return `rotate(${net}deg) scale(${needsShrink ? 0.7 : 1})`;
}

export default function RotateOptions({
  mode,
  setMode,
  allDelta,
  onRotateAll,
  pageRotations,
  setPageRotation,
  onResetPages,
  file,
  pdfPages,
}) {
  const [previews, setPreviews] = useState([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewError, setPreviewError] = useState("");
  const [previewComplete, setPreviewComplete] = useState(false);
  const loadedFileRef = useRef(null);
  const isPagesMode = mode === "pages";

  // The preview renders inside the browser only. It starts the moment a file
  // is selected (preview mode is the default) and restarts when the file
  // changes. A finished job is never restarted on later visits to the tab.
  useEffect(() => {
    if (!isPagesMode || !file) return;
    // pdfPages changes after the pick when the page-count inspection lands.
    // That update must not cancel the running render, so this effect only
    // depends on the mode and the file, and a completed job is never restarted.
    if (loadedFileRef.current === file && previewComplete) {
      return;
    }
    loadedFileRef.current = file;
    setPreviews([]);
    setPreviewTotal(0);
    setPreviewError("");
    setPreviewComplete(false);
    let cancelled = false;

    renderPdfThumbnails(file, {
      targetWidth: PREVIEW_WIDTH,
      onEntry: (entry) => {
        if (cancelled) return;
        setPreviews((current) => [...current, entry]);
        setPreviewTotal(entry.page);
      },
    })
      .then((result) => {
        if (cancelled) return;
        setPreviewTotal(result.total);
        setPreviewComplete(true);
      })
      .catch(() => {
        if (cancelled) return;
        setPreviewError(
          "Preview is not available for this file. Rotate all pages still works.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [isPagesMode, file]);

  const rotatedCount = useMemo(
    () => Object.keys(pageRotations).length,
    [pageRotations],
  );

  const rotatedSummary = useMemo(() => {
    return Object.keys(pageRotations)
      .map(Number)
      .sort((a, b) => a - b)
      .map((page) => `Page ${page} ${SUMMARY_BY_DELTA(pageRotations[page]).toLowerCase()}`)
      .join(", ");
  }, [pageRotations]);

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          Rotate Options
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
          onClick={() => setMode("all")}
          className={
            "pb-2 font-display text-[13px] font-bold transition " +
            (!isPagesMode
              ? "border-b-2 border-orange text-orange"
              : "border-transparent text-muted hover:text-content")
          }
        >
          Rotate all pages
        </button>
        <button
          type="button"
          onClick={() => setMode("pages")}
          className={
            "pb-2 font-display text-[13px] font-bold transition " +
            (isPagesMode
              ? "border-b-2 border-orange text-orange"
              : "border-transparent text-muted hover:text-content")
          }
        >
          Choose pages
        </button>
      </div>

      {!isPagesMode ? (
        <div className="mt-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onRotateAll("left")}
              className="flex flex-1 items-center justify-center gap-2 rounded-[5px] border border-borderStrong bg-deep px-4 py-6 font-display text-[14px] font-bold text-offWhite transition hover:border-borderStrong hover:bg-elevated hover:text-content"
            >
              <RotateCcw className="h-5 w-5" />
              Rotate left
            </button>
            <button
              type="button"
              onClick={() => onRotateAll("right")}
              className="flex flex-1 items-center justify-center gap-2 rounded-[5px] border border-borderStrong bg-deep px-4 py-6 font-display text-[14px] font-bold text-offWhite transition hover:border-borderStrong hover:bg-elevated hover:text-content"
            >
              <RotateCw className="h-5 w-5" />
              Rotate right
            </button>
          </div>
          <p className="mt-3 font-body text-[12px] leading-normal text-muted">
            {allDelta === 0
              ? "Every press turns all pages one quarter turn. Press again for another."
              : allDelta === 180
                ? "All pages will be turned half way around."
                : `All pages will be turned ${
                    allDelta === 90 ? "one quarter to the right" : "one quarter to the left"
                  }.`}
          </p>
        </div>
      ) : (
        <div className="mt-4">
          {previewError && (
            <p className="mb-3 font-body text-xs font-semibold text-orange">
              {previewError}
            </p>
          )}

          {previews.length === 0 && !previewError && (
            <div className="flex items-center gap-3 py-8">
              <RotateCcw className="h-4 w-4 animate-spin text-muted" />
              <p className="font-body text-[13px] text-muted">
                Loading page preview...
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {previews.map((entry) => (
              <PageCard
                key={entry.page}
                entry={entry}
                delta={pageRotations[entry.page] || 0}
                onRotate={(delta) => setPageRotation(entry.page, delta)}
              />
            ))}
          </div>

          {rotatedCount > 0 && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="font-body text-[12px] text-muted">
                {rotatedCount === 1 ? "1 page rotated" : `${rotatedCount} pages rotated`}
                {rotatedSummary ? `: ${rotatedSummary}` : ""}
              </p>
              <button
                type="button"
                onClick={onResetPages}
                className="shrink-0 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-orange hover:text-orangeSoft"
              >
                Reset all
              </button>
            </div>
          )}
          {rotatedCount === 0 && (
            <p className="mt-3 font-body text-[12px] text-muted">
              Use the arrows on a page to turn it. Pages without a turn keep
              their appearance.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

function PageCard({ entry, delta, onRotate }) {
  const turn = (direction) => {
    const turnAmount = direction === "left" ? 270 : 90;
    onRotate(((delta || 0) + turnAmount) % 360);
  };

  return (
    <div
      className={
        "relative w-[172px] rounded-[6px] border p-2 transition " +
        (delta ? "border-orange bg-successBg/40" : "border-borderStrong bg-deep")
      }
    >
      <span className="absolute left-2 top-1.5 font-mono text-[10px] font-bold text-muted">
        {entry.page}
      </span>

      {delta ? (
        <button
          type="button"
          onClick={() => onRotate(0)}
          title="Clear this page"
          className="absolute right-2 top-1.5 rounded-sm p-0.5 text-muted hover:text-error"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}

      <div className="flex h-[150px] items-center justify-center overflow-hidden">
        {entry.thumbnail ? (
          <img
            src={entry.thumbnail}
            alt={`Page ${entry.page}`}
            draggable={false}
            className="max-h-full max-w-full transition-transform duration-200"
            style={{ transform: pageTransform(entry.baseRotation, delta) }}
          />
        ) : (
          <div className="flex h-full w-28 items-center justify-center rounded-[5px] bg-elevated font-mono text-[13px] text-muted">
            {entry.page}
          </div>
        )}
      </div>

      {/* Fixed badge slot: with it, the turn buttons stay in the same spot
          whether a page was turned or not, whatever its orientation. */}
      <p
        className={
          "mt-1 h-[15px] text-center font-display text-[10px] font-bold uppercase leading-[15px] tracking-[0.06em] text-orange " +
          (delta ? "" : "invisible")
        }
      >
        {delta ? SUMMARY_BY_DELTA(delta) : "placeholder"}
      </p>

      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={() => turn("left")}
          title="Turn left"
          className="rounded-[4px] border border-borderStrong bg-panel px-2 py-1.5 text-offWhite hover:bg-elevated hover:text-content"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => turn("right")}
          title="Turn right"
          className="rounded-[4px] border border-borderStrong bg-panel px-2 py-1.5 text-offWhite hover:bg-elevated hover:text-content"
        >
          <RotateCw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
