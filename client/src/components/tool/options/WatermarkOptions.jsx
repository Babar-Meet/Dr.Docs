import Panel from "../../ui/Panel.jsx";
import TextInput from "../../ui/TextInput.jsx";

const TAB_CLASS =
  "pb-1 pt-2 font-display text-[12px] font-semibold uppercase tracking-[0.08em] transition";

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

export default function WatermarkOptions({
  watermarkText,
  setWatermarkText,
  watermarkAngle,
  setWatermarkAngle,
  watermarkOpacity,
  setWatermarkOpacity,
}) {
  return (
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
        The stamp goes centered on every page at 45 degrees, or flat at 0.
        Gray text with the chosen opacity sits on top of your content.
      </p>
    </Panel>
  );
}
