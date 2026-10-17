import { TAG_LABELS, TAG_ORDER } from "./LandingData";

export default function TagBar({ active, onChange }) {
  return (
    <div role="group" aria-label="Filter tools" className="pb-2">
      <div className="flex flex-wrap gap-2">
        {TAG_ORDER.map((tag) => {
          const isActive = tag === active;

          return (
            <button
              key={tag}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(tag)}
              className={
                "inline-flex items-center rounded-full border px-2.5 py-1 font-body text-xs font-semibold transition " +
                (isActive
                  ? "border-orange bg-orange text-black"
                  : "border-borderStrong bg-panel text-offWhite hover:border-orange hover:text-orange")
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
