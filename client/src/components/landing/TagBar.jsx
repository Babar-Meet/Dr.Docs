import { TAG_LABELS, TAG_ORDER } from "./LandingData";

// One centered row of chips, the reference product's category filter shape.
export default function TagBar({ active, onChange }) {
  return (
    <div role="group" aria-label="Filter tools" className="pb-2 pt-1">
      <div className="flex flex-wrap justify-center gap-2">
        {TAG_ORDER.map((tag) => {
          const isActive = tag === active;

          return (
            <button
              key={tag}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(tag)}
              className={
                "inline-flex items-center rounded-full border px-4 py-2 font-body text-sm font-semibold transition " +
                (isActive
                  ? "border-orange bg-orange text-black"
                  : "border-borderStrong bg-panel text-offWhite hover:border-[#666666] hover:text-content")
              }
            >
              {TAG_LABELS[tag]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
