import { ShieldAlert } from "lucide-react";
import Panel from "../ui/Panel";

export default function ToolIntro({ tool, index, total }) {
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[20px] font-bold leading-tight text-white">
            {tool.label}
          </h1>
          <p className="mt-1 font-body text-[13px] font-medium leading-normal text-offWhite">
            {tool.help}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-orange/30 bg-orange/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-orange">
          {index} / {total}
        </span>
      </div>

      <div className="mt-4 rounded-[5px] border border-borderDark bg-deep p-3">
        <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          Tool details
        </p>
        <p className="mt-2 font-body text-[13px] leading-[1.5] text-offWhite">
          {tool.detail}
        </p>
        <p className="mt-3 flex items-center gap-2 font-mono text-[11px] leading-none text-muted">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-muted" />
          Security boundary: strong encryption never bypassed.
        </p>
      </div>
    </Panel>
  );
}
