import { Link } from "react-router-dom";
import ToolTile from "./ToolTile";

export default function ToolSection({ group, hub }) {
  const availableCount = group.tools.filter((tool) => tool.available).length;
  const belongsHere = Boolean(hub) && hub.available && hub.group === group.key;

  return (
    <section id={group.key} className="scroll-mt-28">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-borderDark pb-3">
        <div className="min-w-0">
          <h2 className="font-display text-[26px] font-bold leading-[1.1] tracking-tight text-white sm:text-[36px]">
            {group.title}
          </h2>
          <p className="mt-1 font-body text-[13px] leading-normal text-muted">{group.blurb}</p>
        </div>
        <p className="font-mono text-[11px] leading-none text-muted">
          {availableCount} of {group.tools.length} available
        </p>
      </div>

      {belongsHere && (
        <p className="mt-3 font-body text-[13px] leading-normal text-offWhite">
          Need a pair that has no tile here, such as PDF to ODT or DOCX to EPUB?{" "}
          <Link
            to={`/${hub.slug}`}
            className="font-semibold text-orange hover:text-orangeSoft"
          >
            Open {hub.label}
          </Link>{" "}
          to upload any supported file and pick the target the server supports.
        </p>
      )}

      {availableCount === 0 && (
        <p className="mt-3 rounded-[5px] border border-borderDark bg-deep p-3 font-body text-[13px] leading-normal text-muted">
          No tool in this category runs yet. The tools below are listed so the comparison is
          complete, and none of them can be clicked.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {group.tools.map((tool) => (
          <ToolTile key={tool.id} tool={tool} />
        ))}
      </div>
    </section>
  );
}
