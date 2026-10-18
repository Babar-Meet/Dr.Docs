import { Link } from "react-router-dom";
import { TAG_LABELS, TAG_ORDER } from "./LandingData";

const ACTIVE_CLASS = "border-orange bg-orange text-black";
const IDLE_CLASS =
  "border-borderStrong bg-panel text-offWhite hover:border-[#666666] hover:text-content";
const CHIP_CLASS =
  "inline-flex items-center rounded-full border px-4 py-2 font-body text-sm font-semibold transition";

// One centered row of chips, the reference product's category filter shape.
// The Convert chip is not a filter: it opens the Conversions page, where the
// conversions are grouped per source format with their live targets and the
// queued ones marked Coming soon.
export default function TagBar({ active, onChange }) {
  return (
    <div role="group" aria-label="Filter tools" className="pb-2 pt-1">
      <div className="flex flex-wrap justify-center gap-2">
        {TAG_ORDER.map((tag) => {
          if (tag === "convert") {
            return (
              <Link
                key={tag}
                to="/convert"
                aria-label="Open the conversions page"
                className={`${CHIP_CLASS} ${IDLE_CLASS}`}
              >
                {TAG_LABELS[tag]}
              </Link>
            );
          }

          const isActive = tag === active;
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(tag)}
              className={`${CHIP_CLASS} ${isActive ? ACTIVE_CLASS : IDLE_CLASS}`}
            >
              {TAG_LABELS[tag]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
