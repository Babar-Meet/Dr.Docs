import { CATEGORY_COLORS } from "../../lib/toolConfig";

// The tool icon as a solid document: one filled page in the category color,
// a fold flap at the top right, and the tool's action glyph knocked out in
// white. Same badge language as the file-type chips - a full color block
// with white content, no tinted background square behind a line icon (the
// owner rejected that as recolored leftovers of the old UI). The colored
// page sits directly on the card, like a badge.
export default function ToolDocGlyph({ tool }) {
  const Icon = tool.icon;
  const color = CATEGORY_COLORS[tool.group];

  if (!color) {
    return <Icon className="h-12 w-12 shrink-0 text-muted" />;
  }

  return (
    <svg
      viewBox="0 0 40 48"
      className="h-12 w-10 shrink-0"
      aria-hidden="true"
      focusable="false"
    >
      {/* page body: rounded corners cut away at the top right by the fold */}
      <path
        d="M9 0 H23 L37 14 V42 A6 6 0 0 1 31 48 H9 A6 6 0 0 1 3 42 V6 A6 6 0 0 1 9 0 Z"
        fill={color}
      />
      {/* fold flap over the cut corner */}
      <path d="M23 0 V14 H37 Z" fill="rgba(255,255,255,0.30)" />
      {/* the tool's own action stamp, in white, inside the page */}
      <svg x={8} y={18} width={24} height={24} viewBox="0 0 24 24">
        <Icon
          stroke="#FFFFFF"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          width={24}
          height={24}
        />
      </svg>
    </svg>
  );
}
