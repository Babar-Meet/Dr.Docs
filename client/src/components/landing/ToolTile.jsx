import { Link } from "react-router-dom";
import StatusChip from "../ui/StatusChip";
import { CATEGORY_COLORS } from "../../lib/toolConfig";

const TILE_CLASS = "flex h-full min-w-0 flex-col gap-2 rounded-[6px] border p-4";

// The tile icon in fixed category color on an 18 percent tint of itself, the
// same instantly recognizable chip language as the file-type badges. The
// chip is byte-identical in both themes; DESIGN.md documents the exception.
function IconChip({ tool }) {
  const Icon = tool.icon;
  const color = CATEGORY_COLORS[tool.group];

  if (!color) {
    return <Icon className="h-12 w-12 shrink-0 text-muted" />;
  }

  return (
    <span
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[6px]"
      style={{ backgroundColor: `${color}2E` }}
    >
      <Icon className="h-6 w-6" style={{ color }} />
    </span>
  );
}

export default function ToolTile({ tool, sentence }) {
  if (!tool.available) {
    return (
      <div
        aria-disabled="true"
        title={`${tool.label} - coming soon`}
        className={`${TILE_CLASS} cursor-not-allowed border-borderDark bg-deep`}
      >
        <IconChip tool={tool} />
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
      <IconChip tool={tool} />
      <h3 className="font-display text-[15px] font-bold leading-tight text-content">
        {tool.label}
      </h3>
      <p className="font-body text-[13px] leading-normal text-muted">{sentence}</p>
    </Link>
  );
}
