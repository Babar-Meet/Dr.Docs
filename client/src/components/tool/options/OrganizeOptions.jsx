import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  LayoutGrid,
  RotateCcw,
  Trash2,
} from "lucide-react";
import Panel from "../../ui/Panel.jsx";
import { renderPdfThumbnails } from "../../../lib/pdfThumbs";
import {
  countLine,
  deleteEntries,
  duplicateEntries,
  emptyOrderReason,
  moveEntry,
  orderString,
  parseOrder,
  resetEntries,
} from "../../../lib/organizeOrder";

// The page tiles render at the split preview width, from the same lazy pdf.js
// chunk. Pages past the raster cap show as number tiles and stay draggable and
// selectable, so the arrangement of a long document is still editable.
const PREVIEW_WIDTH = 155;

// One output tile per entry of the arrangement. The strip looks up each
// entry's original page thumbnail, so a duplicate reuses the tile image
// without rendering anything again.
function OrganizeTile({
  page,
  thumbnail,
  selected,
  dragOver,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  const shell =
    "relative w-[172px] rounded-[6px] border p-2 text-left transition " +
    (selected
      ? "border-orange bg-successBg/40"
      : dragOver
        ? "border-orange bg-deep"
        : "border-borderStrong bg-deep hover:bg-elevated");

  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      title={
        selected
          ? `Page ${page} selected. Click again to clear it from the selection.`
          : `Page ${page}. Click to select, drag to move.`
      }
      aria-label={selected ? `Deselect page ${page}` : `Select page ${page}`}
      className={shell}
    >
      <span className="absolute left-2 top-1.5 font-mono text-[10px] font-bold text-muted">
        {page}
      </span>

      <div className="flex h-[150px] items-center justify-center overflow-hidden">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={`Page ${page}`}
            draggable={false}
            className="max-h-full max-w-full"
          />
        ) : (
          <div className="flex h-full w-28 items-center justify-center rounded-[5px] bg-elevated font-mono text-[13px] text-muted">
            {page}
          </div>
        )}
      </div>

      {/* Fixed badge slot: selected tiles carry the label, the rest keep the
          slot empty so heights never jump. */}
      <p
        className={
          "mt-1 h-[15px] text-center font-display text-[10px] font-bold uppercase leading-[15px] tracking-[0.06em] text-orange " +
          (selected ? "" : "invisible")
        }
      >
        {selected ? "Selected" : "placeholder"}
      </p>
    </button>
  );
}

function ToolbarButton({ icon: Icon, label, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="inline-flex items-center justify-center gap-1.5 rounded-[5px] border border-borderStrong bg-deep px-3 py-2 font-display text-[13px] font-bold leading-none text-offWhite transition hover:bg-elevated hover:text-content disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-deep"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export default function OrganizeOptions({
  organizeOrder,
  setOrganizeOrder,
  file,
  pdfPages,
}) {
  const [previews, setPreviews] = useState([]);
  const [previewError, setPreviewError] = useState("");
  const [previewComplete, setPreviewComplete] = useState(false);
  // True once an arrangement was committed, even if it later shrank to
  // nothing. It separates "not arranged yet" from "everything was deleted";
  // both are an empty organizePages string on the wire, and the server
  // refuses both with the hint.
  const [arranged, setArranged] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [dragOverIndex, setDragOverIndex] = useState(-1);
  const loadedFileRef = useRef(null);
  const dragIndexRef = useRef(null);

  // Preview mechanics copied from SplitOptions: raster once on file pick,
  // progressive fill through onEntry, never a rerun for the same file.
  useEffect(() => {
    if (!file) return;
    if (loadedFileRef.current === file && previewComplete) {
      return;
    }
    loadedFileRef.current = file;
    setPreviews([]);
    setPreviewError("");
    setPreviewComplete(false);
    setArranged(false);
    setSelectedIndices(new Set());
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
          "Preview is not available for this file. The order below still works.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  const thumbByPage = useMemo(() => {
    const map = new Map();
    for (const entry of previews) {
      map.set(entry.page, entry.thumbnail);
    }
    return map;
  }, [previews]);

  // The strip always shows the final output: the committed arrangement when
  // there is one, the fresh 1..N order before the first edit.
  const parseResult = useMemo(
    () => parseOrder(organizeOrder, pdfPages),
    [organizeOrder, pdfPages],
  );
  const entries =
    parseResult.entries.length > 0
      ? parseResult.entries
      : arranged
        ? []
        : resetEntries(pdfPages);

  const write = (nextEntries) => {
    setOrganizeOrder(orderString(nextEntries));
    setArranged(true);
  };

  const toggleSelect = (index) => {
    setSelectedIndices((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const selectedPositions = [...selectedIndices]
    .filter((index) => index < entries.length)
    .sort((a, b) => a - b);
  const onlySelected =
    selectedPositions.length === 1 ? selectedPositions[0] : -1;

  const canDelete = selectedPositions.length > 0;
  const canDuplicate = selectedPositions.length > 0;
  const canMoveLeft = onlySelected > 0;
  const canMoveRight = onlySelected !== -1 && onlySelected < entries.length - 1;
  const canReset = pdfPages !== null;

  const deleteSelected = () => {
    if (!canDelete) return;
    write(deleteEntries(entries, selectedPositions));
    setSelectedIndices(new Set());
  };

  const duplicateSelected = () => {
    if (!canDuplicate) return;
    write(duplicateEntries(entries, selectedPositions));
    setSelectedIndices(new Set());
  };

  const moveSelected = (delta) => {
    if (onlySelected === -1) return;
    const next = moveEntry(entries, onlySelected, delta);
    if (next === entries) return;
    write(next);
    setSelectedIndices(new Set([onlySelected + delta]));
  };

  const resetOrder = () => {
    if (!canReset) return;
    write(resetEntries(pdfPages));
    setSelectedIndices(new Set());
  };

  // Native drag and drop: the drop lands the dragged tile at the hovered
  // tile's position, the same moveEntry one step at a time uses.
  const handleDragStart = (event, index) => {
    dragIndexRef.current = index;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };

  const handleDragOver = (event, index) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverIndex((current) => (current === index ? current : index));
  };

  const handleDrop = (event, index) => {
    event.preventDefault();
    const from = dragIndexRef.current;
    dragIndexRef.current = null;
    setDragOverIndex(-1);
    if (from === null || from === index) return;
    const next = moveEntry(entries, from, index - from);
    if (next === entries) return;
    write(next);
    setSelectedIndices(new Set());
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
    setDragOverIndex(-1);
  };

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          Organize Options
        </p>
        {pdfPages !== null && (
          <p className="font-body text-[11px] text-muted">
            {pdfPages} page{pdfPages === 1 ? "" : "s"}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ToolbarButton
          icon={Trash2}
          label="Delete pages"
          disabled={!canDelete}
          onClick={deleteSelected}
        />
        <ToolbarButton
          icon={Copy}
          label="Duplicate"
          disabled={!canDuplicate}
          onClick={duplicateSelected}
        />
        <ToolbarButton
          icon={ArrowLeft}
          label="Move left"
          disabled={!canMoveLeft}
          onClick={() => moveSelected(-1)}
        />
        <ToolbarButton
          icon={ArrowRight}
          label="Move right"
          disabled={!canMoveRight}
          onClick={() => moveSelected(1)}
        />
        <ToolbarButton
          icon={RotateCcw}
          label="Reset order"
          disabled={!canReset}
          onClick={resetOrder}
        />
      </div>

      {parseResult.entries.length === 0 && (
        <p className="mt-3 rounded-[5px] bg-deep px-3 py-2 font-body text-xs text-muted">
          {emptyOrderReason()}
        </p>
      )}

      <div className="mt-4 border-t border-borderStrong/70 pt-3">
        {previewError && (
          <p className="mb-3 font-body text-xs font-semibold text-orange">
            {previewError}
          </p>
        )}

        {previews.length === 0 && !previewError && !previewComplete && (
          <div className="flex items-center gap-3 py-6">
            <LayoutGrid className="h-4 w-4 animate-spin text-muted" />
            <p className="font-body text-[13px] text-muted">
              Loading page preview...
            </p>
          </div>
        )}

        {entries.length > 0 && (
          <>
            <p className="font-body text-[12px] text-muted">
              {countLine(entries.length)}
            </p>

            <div className="mt-3 flex flex-wrap gap-3">
              {entries.map((page, index) => (
                <OrganizeTile
                  key={index}
                  page={page}
                  thumbnail={thumbByPage.get(page) || ""}
                  selected={selectedIndices.has(index)}
                  dragOver={dragOverIndex === index}
                  onSelect={() => toggleSelect(index)}
                  onDragStart={(event) => handleDragStart(event, index)}
                  onDragOver={(event) => handleDragOver(event, index)}
                  onDrop={(event) => handleDrop(event, index)}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
