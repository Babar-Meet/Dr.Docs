import { Link } from "react-router-dom";
import Panel from "../ui/Panel";
import { liveTools } from "../../lib/toolConfig";

export default function RelatedTools({ tool }) {
  const siblings = liveTools().filter(
    (item) => item.group === tool.group && item.id !== tool.id,
  );

  if (siblings.length === 0) return null;

  return (
    <Panel className="mt-6">
      <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
        Related tools
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {siblings.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              to={`/${item.slug}`}
              title={item.help}
              className="flex items-center gap-2 rounded-[5px] border border-borderDark bg-deep px-3 py-2.5 font-body text-[13px] font-bold text-offWhite transition hover:border-borderStrong hover:bg-elevated hover:text-content"
            >
              <Icon className="h-4 w-4 shrink-0 text-muted" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}
