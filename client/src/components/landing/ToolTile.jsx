import { Link } from "react-router-dom";
import StatusChip from "../ui/StatusChip";

const TILE_CLASS = "flex min-w-0 flex-col gap-2 rounded-[6px] border p-4";

export default function ToolTile({ tool }) {
  const Icon = tool.icon;

  if (!tool.available) {
    return (
      <div
        aria-disabled="true"
        title={`${tool.label} - not available yet`}
        className={`${TILE_CLASS} border-borderDark bg-deep`}
      >
        <div className="flex items-start justify-between gap-2">
          <Icon className="h-5 w-5 shrink-0 text-muted" />
          <StatusChip>Not available</StatusChip>
        </div>
        <p className="break-words font-display text-[14px] font-bold leading-tight text-muted">
          {tool.label}
        </p>
        <p className="break-words font-body text-[13px] leading-normal text-muted">{tool.help}</p>
      </div>
    );
  }

  return (
    <Link
      to={`/${tool.slug}`}
      title={tool.help}
      className={`${TILE_CLASS} group border-borderDark bg-panel transition hover:border-borderStrong hover:bg-elevated`}
    >
      <Icon className="h-5 w-5 shrink-0 text-muted transition group-hover:text-white" />
      <p className="break-words font-display text-[14px] font-bold leading-tight text-white">
        {tool.label}
      </p>
      <p className="break-words font-body text-[13px] leading-normal text-muted">{tool.help}</p>
      <span className="mt-auto pt-1 font-mono text-[11px] leading-none text-muted">
        /{tool.slug}
      </span>
    </Link>
  );
}
