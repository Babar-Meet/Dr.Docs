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

export default function PageNumbersOptions({
  pageNumberPosition,
  setPageNumberPosition,
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
      <p className="mt-3 font-body text-xs text-muted">
        Numbers 1, 2, 3 start on the first page. The stamp is small dark gray
        text at the chosen spot, and the same spot is used on every page.
      </p>
    </Panel>
  );
}
