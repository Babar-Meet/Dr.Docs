import { useEffect, useRef, useState } from "react";
import Panel from "../../ui/Panel.jsx";
import TextInput from "../../ui/TextInput.jsx";
import { loadPdfjs } from "../../../lib/pdfThumbs";
import { stampSize, measureUnitWidth, mosaicGrid } from "../../../lib/watermarkStamp";

const TAB_CLASS =
  "pb-1 pt-2 font-display text-[12px] font-semibold uppercase tracking-[0.08em] transition";

// The preview mirrors the server draw (utils/processors/watermarkProcessor.js):
// one stamp size per box (page for Single, cell for Tiled) auto-fit from the
// text, then clamped; gray rgb(0.55) text; opacity as alpha; 45 degrees
// counter-clockwise. Scaled here from the real page width in points to the
// thumbnail width in pixels. Only the pages shown are rastered, once each;
// changing the text, type, angle or opacity repaints the stamps on top and
// never re-rasters a page.
const THUMB_WIDTH_PX = 224;
const START_PAGES = 3;
const LOAD_BATCH = 3;
const MAX_PREVIEW_PAGES = 60;

// One-tap stamps for the text box. Pure client convenience: each chip just
// fills the same watermarkText field the user could type into.
const PRESET_TEXTS = [
  "Draft",
  "Final",
  "Confidential",
  "Do Not Copy",
  "Sample",
  "Urgent",
];

const PRESET_CHIP_CLASS =
  "rounded-[4px] border border-borderStrong bg-deep px-2 py-1 font-mono text-[11px] text-muted transition hover:border-orange hover:text-content";

function AngleTab({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? `${TAB_CLASS} -mb-px border-b-2 border-orange text-orange`
          : `${TAB_CLASS} border-b-2 border-transparent text-muted hover:text-content`
      }
    >
      {children}
    </button>
  );
}

// The single stamp overlay for one thumbnail page: center placement, the
// mirrored size, the same gray, the chosen opacity, and the diagonal tilted
// counter-clockwise so it visually matches the downloaded output. scalePxPerPt
// is points-to-pixels for the thumbnail; single stamps derive it from the
// page box, while the tiled overlay keeps the page scale and passes it in so
// its cell-sized stamps are not inflated by the smaller box.
function singleOverlay(
  text,
  angle,
  opacityPercent,
  widthPt,
  heightPt,
  scalePxPerPt,
) {
  const pxPerPt = scalePxPerPt ?? THUMB_WIDTH_PX / widthPt;
  const sizePt = stampSize({
    pageWidth: widthPt,
    pageHeight: heightPt,
    unitWidth: measureUnitWidth(text),
    angle: Number(angle),
  });
  return {
    fontSize: `${Math.max(2, sizePt * pxPerPt)}px`,
    color: "#8C8C8C",
    opacity: opacityPercent / 100,
    transform: `translate(-50%, -50%) rotate(${angle === "45" ? -45 : 0}deg)`,
    whiteSpace: "nowrap",
    fontFamily: "Helvetica, Arial, 'Helvetica Neue', sans-serif",
  };
}

// The tiled overlay: the same grid the server stamps (three cells across,
// rows beneath), one rotated stamp per cell center, sized by the same rule
// applied to the cell box instead of the page.
function tileOverlays(text, angle, opacityPercent, widthPt, heightPt) {
  const grid = mosaicGrid({ pageWidth: widthPt, pageHeight: heightPt });
  // The thumbnail scale always follows the page box, never the cell, or the
  // cell-sized stamps would render three times too big on screen.
  const stamp = singleOverlay(
    text,
    angle,
    opacityPercent,
    grid.cellWidth,
    grid.cellHeight,
    THUMB_WIDTH_PX / widthPt,
  );
  const tiles = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      tiles.push({
        key: `${row}-${col}`,
        left: `${((col + 0.5) / grid.cols) * 100}%`,
        top: `${((row + 0.5) / grid.rows) * 100}%`,
        style: stamp,
      });
    }
  }
  return tiles;
}

function PreviewPageCard({ entry, text, angle, opacityPercent, type }) {
  return (
    <div className="relative inline-block">
      <img
        src={entry.dataURL}
        alt={`Page ${entry.page} preview`}
        className="block rounded-[5px] border border-borderDark"
        style={{ width: `${THUMB_WIDTH_PX}px` }}
      />
      {text &&
        (type === "mosaic"
          ? tileOverlays(text, angle, opacityPercent, entry.widthPt, entry.heightPt).map(
              (tile) => (
                <span
                  key={tile.key}
                  aria-hidden="true"
                  className="absolute leading-none"
                  style={{ left: tile.left, top: tile.top, ...tile.style }}
                >
                  {text}
                </span>
              ),
            )
          : (
            <span
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 leading-none"
              style={singleOverlay(
                text,
                angle,
                opacityPercent,
                entry.widthPt,
                entry.heightPt,
              )}
            >
              {text}
            </span>
          ))}
    </div>
  );
}

export default function WatermarkOptions({
  watermarkText,
  setWatermarkText,
  watermarkAngle,
  setWatermarkAngle,
  watermarkOpacity,
  setWatermarkOpacity,
  watermarkType,
  setWatermarkType,
  file,
}) {
  const [pages, setPages] = useState([]);
  const [available, setAvailable] = useState(0);
  const [visibleCount, setVisibleCount] = useState(START_PAGES);
  const [docError, setDocError] = useState("");
  const docRef = useRef(null);
  const renderedRef = useRef({});

  // Open and dispose the preview document with the picked file. Keyed on the
  // file only, never on the growing page list (the round 13 rotate lesson:
  // restarting on page-count changes cancelled the running render job).
  useEffect(() => {
    docRef.current = null;
    renderedRef.current = {};
    setPages([]);
    setAvailable(0);
    setVisibleCount(START_PAGES);
    setDocError("");

    if (!file) {
      return;
    }

    let cancelled = false;
    let doc = null;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const data = await file.arrayBuffer();
        doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        docRef.current = doc;
        setAvailable(doc.numPages);
      } catch (error) {
        if (!cancelled) {
          setDocError(
            "Preview unavailable for this file: it may be encrypted or damaged.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      if (doc) doc.destroy();
    };
  }, [file]);

  // Render the shown pages in batches so big files stay responsive: the
  // first few pages as the reference, then only on Load more clicks.
  useEffect(() => {
    const doc = docRef.current;
    if (!doc || !available) {
      return;
    }
    let cancelled = false;
    const wanted = Math.min(visibleCount, available, MAX_PREVIEW_PAGES);
    (async () => {
      for (let pageNumber = 1; pageNumber <= wanted; pageNumber += 1) {
        if (renderedRef.current[pageNumber]) continue;
        try {
          const page = await doc.getPage(pageNumber);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({
            scale: THUMB_WIDTH_PX / base.width,
          });
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.floor(viewport.width));
          canvas.height = Math.max(1, Math.floor(viewport.height));
          const context = canvas.getContext("2d");
          await page.render({ canvasContext: context, viewport }).promise;
          if (cancelled) return;
          renderedRef.current[pageNumber] = {
            page: pageNumber,
            dataURL: canvas.toDataURL("image/jpeg", 0.75),
            widthPt: base.width,
            heightPt: base.height,
          };
          setPages(Object.values(renderedRef.current));
        } catch (error) {
          if (cancelled) return;
          setDocError(
            "Preview unavailable for this file: it may be encrypted or damaged.",
          );
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [available, visibleCount]);

  const shown = Math.min(visibleCount, available, MAX_PREVIEW_PAGES);
  const canLoadMore = available > shown;

  return (
    <>
      <Panel>
        <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          Watermark Text
        </p>
        <TextInput
          type="text"
          value={watermarkText}
          onChange={(event) => setWatermarkText(event.target.value)}
          placeholder="Company name"
          className="mt-3"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {PRESET_TEXTS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setWatermarkText(preset)}
              className={PRESET_CHIP_CLASS}
            >
              {preset}
            </button>
          ))}
        </div>

        <div className="mt-4 border-b border-borderDark">
          <div className="flex gap-4">
            <AngleTab
              active={watermarkType === "standard"}
              onClick={() => setWatermarkType("standard")}
            >
              Single
            </AngleTab>
            <AngleTab
              active={watermarkType === "mosaic"}
              onClick={() => setWatermarkType("mosaic")}
            >
              Tiled
            </AngleTab>
          </div>
        </div>

        <div className="mt-4 border-b border-borderDark">
          <div className="flex gap-4">
            <AngleTab
              active={watermarkAngle === "45"}
              onClick={() => setWatermarkAngle("45")}
            >
              Diagonal
            </AngleTab>
            <AngleTab
              active={watermarkAngle === "0"}
              onClick={() => setWatermarkAngle("0")}
            >
              Flat
            </AngleTab>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <p className="shrink-0 font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
            Opacity
          </p>
          <input
            type="range"
            min="10"
            max="90"
            step="5"
            value={watermarkOpacity}
            onChange={(event) => setWatermarkOpacity(event.target.value)}
            className="w-full accent-orange"
            aria-label="Watermark opacity"
          />
          <span className="w-10 shrink-0 text-right font-mono text-[12px] text-content">
            {watermarkOpacity}%
          </span>
        </div>

        <p className="mt-3 font-body text-xs text-muted">
          {watermarkType === "mosaic"
            ? "The stamp repeats in a grid across every page, tilted at 45 degrees or flat at 0."
            : "The stamp goes centered on every page at 45 degrees, or flat at 0."}{" "}
          Gray text with the chosen opacity sits on top of your content.
        </p>
      </Panel>

      <Panel className="mt-4">
        <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          Watermark Preview
        </p>
        {file && (
          <p className="mt-2 truncate font-body text-xs text-muted">
            {file.name}
            {available > 0 ? ` - ${available} pages` : ""}
          </p>
        )}
        {available > 0 && (
          <p className="mt-1 font-body text-xs text-muted">
            Showing the first {shown} of {available} pages as reference. Load
            more adds 3 at a time; changing the settings never renders these
            pages again.
          </p>
        )}

        {!file && (
          <p className="mt-3 font-body text-xs text-muted">
            The preview appears here once a PDF is picked.
          </p>
        )}

        {docError && (
          <p className="mt-3 font-body text-xs text-muted">{docError}</p>
        )}

        {pages.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3">
            {pages.map((entry) => (
              <PreviewPageCard
                key={entry.page}
                entry={entry}
                text={watermarkText.trim()}
                angle={watermarkAngle}
                opacityPercent={Number(watermarkOpacity)}
                type={watermarkType}
              />
            ))}
          </div>
        )}

        {pages.length > 0 && !watermarkText.trim() && (
          <p className="mt-3 font-body text-xs text-muted">
            Type the watermark text above and it shows on these pages right away.
          </p>
        )}

        {canLoadMore && (
          <button
            type="button"
            onClick={() =>
              setVisibleCount((current) =>
                Math.min(current + LOAD_BATCH, available, MAX_PREVIEW_PAGES),
              )
            }
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-[5px] border border-borderStrong bg-deep px-4 py-2 font-display text-[13px] font-bold leading-none text-offWhite transition hover:bg-elevated hover:text-content"
          >
            Load more pages
          </button>
        )}
      </Panel>
    </>
  );
}
