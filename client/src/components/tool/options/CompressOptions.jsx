import Panel from "../../ui/Panel.jsx";

// The four levels the server accepts. The id is the wire value; the label is
// what the button says. "low" is the gentlest lossy preset, so it reads as
// Light rather than Low, which could be mistaken for the smallest file.
const LEVELS = [
  {
    id: "lossless",
    label: "Lossless",
    sublabel: "Default",
    desc: "Linearizes the file and compresses its streams. Text and images stay untouched.",
  },
  {
    id: "low",
    label: "Light",
    sublabel: "Least compression",
    desc: "Re-encodes JPEG images at quality 85, resizing large ones to fit 2000px.",
  },
  {
    id: "recommended",
    label: "Recommended",
    sublabel: "Balanced",
    desc: "Re-encodes JPEG images at quality 75, resizing large ones to fit 1500px.",
  },
  {
    id: "extreme",
    label: "Extreme",
    sublabel: "Smallest",
    desc: "Re-encodes JPEG images at quality 50, resizing large ones to fit 1000px.",
  },
];

export default function CompressOptions({
  compressionLevel = "lossless",
  setCompressionLevel,
}) {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          Compression Level
        </p>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {LEVELS.map((level) => {
          const isSelected = (compressionLevel || "lossless") === level.id;
          return (
            <button
              key={level.id}
              type="button"
              onClick={() => setCompressionLevel(level.id)}
              aria-pressed={isSelected}
              className={
                "rounded-[6px] border p-3 text-left transition " +
                (isSelected
                  ? "border-orange bg-deep"
                  : "border-borderStrong bg-deep hover:bg-elevated")
              }
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-[13px] font-bold text-content">
                  {level.label}
                </span>
                <span
                  className={
                    "font-mono text-[10px] font-semibold uppercase " +
                    (isSelected ? "text-orange" : "text-muted")
                  }
                >
                  {level.sublabel}
                </span>
              </div>
              <p className="mt-1 font-body text-[11px] leading-relaxed text-muted">
                {level.desc}
              </p>
            </button>
          );
        })}
      </div>

      <p className="mt-3 font-body text-[11px] leading-relaxed text-muted">
        Lossless is the default and leaves images untouched. The other three
        levels only re-encode JPEG images; if the result is not smaller, the
        original file is kept.
      </p>
    </Panel>
  );
}
