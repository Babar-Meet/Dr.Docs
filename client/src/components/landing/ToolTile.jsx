import { Link } from "react-router-dom";
import StatusChip from "../ui/StatusChip";

const TILE_CLASS = "flex h-full min-w-0 flex-col gap-2 rounded-[6px] border p-4";

export default function ToolTile({ tool, sentence }) {
  const Icon = tool.icon;

  if (!tool.available) {
    return (
      <div
        aria-disabled="true"
        title={`${tool.label} - coming soon`}
        className={`${TILE_CLASS} cursor-not-allowed border-borderDark bg-deep`}
      >
        <Icon className="h-12 w-12 shrink-0 text-muted" />
        <h3 className="font-display text-[15px] font-bold leading-tight text-muted">
          {tool.label}
        </h3>
        <p className="font-body text-[13px] leading-normal text-muted">{sentence}</p>
        <StatusChip>Coming soon</StatusChip>
      </div>
    );
  }

  return (
    <Link
      to={`/${tool.slug}`}
      className={`${TILE_CLASS} group border-borderDark bg-panel transition hover:border-borderStrong hover:bg-elevated`}
    >
      <Icon className="h-12 w-12 shrink-0 text-muted transition group-hover:text-content" />
      <h3 className="font-display text-[15px] font-bold leading-tight text-content">
        {tool.label}
      </h3>
      <p className="font-body text-[13px] leading-normal text-muted">{sentence}</p>
    </Link>
  );
}
