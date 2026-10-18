import { Link } from "react-router-dom";
import StatusChip from "../components/ui/StatusChip";
import { buildConversionSections } from "../lib/conversionsHub";

function ExtensionChip({ text }) {
  return (
    <span className="shrink-0 rounded-[4px] border border-borderDark bg-deep px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted">
      {text}
    </span>
  );
}

function TileRow({ tile, muted }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={
          "truncate font-display text-[14px] font-bold leading-tight " +
          (muted ? "text-muted" : "text-content")
        }
      >
        {tile.label}
      </span>
      <ExtensionChip text={tile.extension} />
    </div>
  );
}

function ConversionTile({ tile }) {
  if (!tile.implemented) {
    return (
      <li>
        <div
          aria-disabled="true"
          title="Coming soon"
          className="flex h-full cursor-not-allowed flex-col gap-1.5 rounded-[6px] border border-borderDark bg-deep p-3.5"
        >
          <TileRow tile={tile} muted />
          <p className="font-body text-[12px] leading-normal text-muted">{tile.note}</p>
          <StatusChip>Coming soon</StatusChip>
        </div>
      </li>
    );
  }

  return (
    <li>
      <Link
        to={tile.href}
        className="flex h-full flex-col gap-1.5 rounded-[6px] border border-borderDark bg-panel p-3.5 transition hover:border-borderStrong hover:bg-elevated"
      >
        <TileRow tile={tile} />
        <p className="font-body text-[12px] leading-normal text-muted">{tile.note}</p>
      </Link>
    </li>
  );
}

export default function ConversionsPage() {
  const sections = buildConversionSections();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
      <h1 className="font-display text-[36px] font-bold leading-[1.1] tracking-tight text-content">
        Conversions
      </h1>
      <p className="mt-3 max-w-2xl font-body text-[15px] leading-normal text-muted">
        Every conversion grouped by the file you start from, so the possible
        targets for one format all sit in that format's section. Tiles without
        a built tool yet show Coming soon.
      </p>

      <div className="mt-8 flex flex-col gap-8">
        {sections.map((section) => (
          <section key={section.key} aria-labelledby={`conversions-${section.key}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2
                id={`conversions-${section.key}`}
                className="font-display text-[20px] font-bold leading-tight text-content"
              >
                {section.heading}
              </h2>
              <ExtensionChip text={section.ext} />
              <span className="font-mono text-[11px] text-muted">
                {section.liveCount} live
              </span>
            </div>
            <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {section.tiles.map((tile) => (
                <ConversionTile key={tile.id} tile={tile} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
