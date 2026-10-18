import { useEffect, useRef, useState } from "react";
import Panel from "../../ui/Panel.jsx";
import { loadPdfjs } from "../../../lib/pdfThumbs";

const POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

const LABEL_BY_POSITION = {
  "top-left": "Top left",
  "top-center": "Top center",
  "top-right": "Top right",
  "middle-left": "Middle left",
  "middle-center": "Middle center",
  "middle-right": "Middle right",
  "bottom-left": "Bottom left",
  "bottom-center": "Bottom center",
  "bottom-right": "Bottom right",
};

const THUMB_WIDTH_PX = 224;
const START_PAGES = 3;
const LOAD_BATCH = 3;
const MAX_PREVIEW_PAGES = 60;

function Cell({ position, position0, setPageNumberPosition }) {
  const active = position0 === position;
  return (
    <button
      type="button"
      onClick={() => setPageNumberPosition(position)}
      title={LABEL_BY_POSITION[position]}
      aria-label={LABEL_BY_POSITION[position]}
      className={
        "flex h-9 w-9 items-center justify-center rounded-[5px] border transition " +
        (active
          ? "border-orange bg-orange/10 text-orange"
          : "border-borderStrong bg-deep text-muted hover:text-content")
      }
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
    </button>
  );
}

// The stamp mirrors the server draw: 11 pt bold-ish dark gray (rgb 0.15)
// text, margin in points from the chosen edge, scaled here from the real
// page width in points to the thumbnail width in pixels.
function stampOverlay(position, margin, widthPt, pageNumber) {
  const pxPerPt = THUMB_WIDTH_PX / widthPt;
  const offset = margin * pxPerPt;

  const style = {
    fontSize: `${Math.max(2, 11 * pxPerPt)}px`,
  };

  const centering = [];
  if (position.endsWith("left")) {
    style.left = `${offset}px`;
  } else if (position.endsWith("right")) {
    style.right = `${offset}px`;
  } else {
    style.left = "50%";
    centering.push("translateX(-50%)");
  }

  if (position.startsWith("top")) {
    style.top = `${offset}px`;
  } else if (position.startsWith("middle")) {
    style.top = "50%";
    centering.push("translateY(-50%)");
  } else {
    style.bottom = `${offset}px`;
  }

  if (centering.length > 0) {
    style.transform = centering.join(" ");
  }

  return { children: String(pageNumber), style };
}

function PreviewPageCard({ entry, position, margin }) {
  const stamp = stampOverlay(position, margin, entry.widthPt, entry.page);
  return (
    <div className="relative inline-block">
      <img
        src={entry.dataURL}
        alt={`Page ${entry.page} preview`}
        className="block rounded-[5px] border border-borderDark"
        style={{ width: `${THUMB_WIDTH_PX}px` }}
      />
      <span
        aria-hidden="true"
        className="absolute font-body font-bold leading-none text-[#262626]"
        style={stamp.style}
      >
        {stamp.children}
      </span>
    </div>
  );
}

export default function PageNumbersOptions({
  pageNumberPosition,
  setPageNumberPosition,
  pageNumberMargin,
  setPageNumberMargin,
  file,
}) {
  const [pages, setPages] = useState([]);
  const [available, setAvailable] = useState(0);
  const [visibleCount, setVisibleCount] = useState(START_PAGES);
  const [docError, setDocError] = useState("");
  const docRef = useRef(null);
  const renderedRef = useRef({});

  // Open and dispose the preview document with the picked file.
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

  // Render the shown pages in batches of three so big files stay responsive.
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
          Number Position
        </p>
        <div className="mt-3 grid w-fit grid-cols-3 gap-1.5">
          {POSITIONS.map((position) => (
            <Cell
              key={position}
              position={position}
              position0={pageNumberPosition}
              setPageNumberPosition={setPageNumberPosition}
            />
          ))}
        </div>

        <p className="mt-4 font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          Margin From Edge
        </p>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={pageNumberMargin}
            onChange={(event) => setPageNumberMargin(event.target.value)}
            className="w-full accent-orange"
            aria-label="Page number margin in points"
          />
          <span className="w-14 shrink-0 text-right font-mono text-[12px] text-content">
            {pageNumberMargin} pt
          </span>
        </div>
        <p className="mt-3 font-body text-xs text-muted">
          The margin is the distance from the chosen edge, in points. 10 pt
          sits exactly ten points away from it.
        </p>
      </Panel>

      <Panel className="mt-4">
        <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          Page Preview
        </p>
        {file && (
          <p className="mt-2 truncate font-body text-xs text-muted">
            {file.name}
            {available > 0 ? ` - ${available} pages` : ""}
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
                position={pageNumberPosition}
                margin={Number(pageNumberMargin)}
              />
            ))}
          </div>
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
