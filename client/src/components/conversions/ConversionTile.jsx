import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import StatusChip from "../ui/StatusChip";

// One conversion tile: the source badge, an arrow, the target badge, then
// title and note. Live tiles link to the tool page or pair page; queued
// tiles are inert and say Coming soon. Shared by the Conversions page and
// the landing Any To Any block.
function FormatBadge({ text, color }) {
  return (
    <span
      className="inline-flex h-6 min-w-8 items-center justify-center whitespace-nowrap rounded-[4px] px-1.5 font-mono text-[10px] font-bold uppercase leading-none text-white"
      style={{ backgroundColor: color }}
    >
      {text}
    </span>
  );
}

function TileBadges({ tile }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      <FormatBadge text={tile.sourceText} color={tile.sourceColor} />
      <ArrowRight size={14} strokeWidth={2} className="shrink-0 text-muted" />
      <FormatBadge text={tile.targetText} color={tile.targetColor} />
    </div>
  );
}

export default function ConversionTile({ tile }) {
  if (!tile.implemented) {
    return (
      <li>
        <div
          aria-disabled="true"
          title="Coming soon"
          className="flex h-full cursor-not-allowed flex-col gap-1.5 rounded-[6px] border border-borderDark bg-deep p-3.5"
        >
          <TileBadges tile={tile} />
          <span className="font-display text-[15px] font-bold leading-tight text-muted">
            {tile.label}
          </span>
          <p className="font-body text-[12px] leading-normal text-muted">{tile.note}</p>
          <span className="mt-auto pt-1">
            <StatusChip>Coming soon</StatusChip>
          </span>
        </div>
      </li>
    );
  }

  return (
    <li>
      <Link
        to={tile.href}
        className="group flex h-full flex-col gap-1.5 rounded-[6px] border border-borderDark bg-panel p-3.5 transition hover:border-borderStrong hover:bg-elevated"
      >
        <TileBadges tile={tile} />
        <span className="font-display text-[15px] font-bold leading-tight text-content">
          {tile.label}
        </span>
        <p className="font-body text-[12px] leading-normal text-muted">{tile.note}</p>
      </Link>
    </li>
  );
}
