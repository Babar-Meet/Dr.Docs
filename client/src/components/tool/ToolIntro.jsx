import { ArrowRight } from "lucide-react";
import { FORMAT_COLORS } from "../../lib/conversionsHub";

// Conversion pages (a pair with a fixed target) show the pair visually: the
// source badge, an arrow, the target badge. Standard file-type colors from
// FORMAT_COLORS, the same coding the Conversions page tiles use.
function ConversionBadges({ tool }) {
  const SourceKey = tool.sourceExtensions[0].slice(1);
  const sourceColor = FORMAT_COLORS[SourceKey] || "#6B7280";
  const targetColor = FORMAT_COLORS[tool.targetFormat] || "#6B7280";
  return (
    <div className="mt-3 flex items-center justify-center gap-2" aria-hidden="true">
      <span
        className="inline-flex h-7 min-w-10 items-center justify-center whitespace-nowrap rounded-[5px] px-2 font-mono text-[11px] font-bold uppercase leading-none text-white"
        style={{ backgroundColor: sourceColor }}
      >
        {SourceKey}
      </span>
      <ArrowRight size={16} strokeWidth={2} className="text-muted" />
      <span
        className="inline-flex h-7 min-w-10 items-center justify-center whitespace-nowrap rounded-[5px] px-2 font-mono text-[11px] font-bold uppercase leading-none text-white"
        style={{ backgroundColor: targetColor }}
      >
        {tool.targetFormat}
      </span>
    </div>
  );
}

export default function ToolIntro({ tool }) {
  const isPair =
    tool.operation === "convert" &&
    Boolean(tool.targetFormat) &&
    Array.isArray(tool.sourceExtensions) &&
    tool.sourceExtensions.length > 0;

  return (
    <header className="text-center">
      <h1 className="font-display text-[36px] font-bold leading-tight text-content">
        {tool.label}
      </h1>
      {isPair && <ConversionBadges tool={tool} />}
      <p className="mx-auto mt-2 max-w-[52ch] font-body text-[16px] font-medium leading-normal text-offWhite">
        {tool.help}
      </p>
    </header>
  );
}
