import Panel from "../../ui/Panel.jsx";

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

// A white page mock: the number sits at the same spot the real stamp will
// land on, scaled from the 595 x 842 pt reference page to the block. The
// margin value is in PDF points, changed by the slider next to it.
function PagePreview({ position, margin }) {
  const anchor = {};
  if (position.startsWith("top")) {
    anchor.top = `${(margin / 842) * 100}%`;
  } else if (position.startsWith("middle")) {
    anchor.top = "50%";
  } else {
    anchor.bottom = `${(margin / 842) * 100}%`;
  }

  if (position.endsWith("left")) {
    anchor.left = `${(margin / 595) * 100}%`;
  } else if (position.endsWith("right")) {
    anchor.right = `${(margin / 595) * 100}%`;
  } else {
    anchor.left = "50%";
  }

  const centering = [];
  if (position.startsWith("middle")) centering.push("translateY(-50%)");
  if (position.endsWith("center")) centering.push("translateX(-50%)");

  return (
    <div className="relative h-44 w-32 shrink-0 overflow-hidden rounded-[5px] border border-borderDark bg-white">
      <span
        aria-hidden="true"
        className="absolute font-body text-[11px] font-bold leading-none text-[#262626]"
        style={{
          ...anchor,
          transform: centering.length > 0 ? centering.join(" ") : undefined,
        }}
      >
        1
      </span>
    </div>
  );
}

export default function PageNumbersOptions({
  pageNumberPosition,
  setPageNumberPosition,
  pageNumberMargin,
  setPageNumberMargin,
}) {
  return (
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

      <div className="mt-4 flex items-start gap-4">
        <PagePreview
          position={pageNumberPosition}
          margin={Number(pageNumberMargin)}
        />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
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
            The preview shows where the number lands. The margin is the
            distance from the chosen edge, in points, so 10 pt sits exactly
            ten points above the bottom.
          </p>
        </div>
      </div>
    </Panel>
  );
}
