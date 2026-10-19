import { buildConversionSections } from "../../lib/conversionsHub";
import ConversionTile from "./ConversionTile";

// The six per-source conversion sections as one list. The Conversions page
// renders them at page heading level; the landing embeds them under its
// Convert Any To Any section with h3 headings, so the heading tag and size
// are props.
function ExtensionChip({ text }) {
  return (
    <span className="shrink-0 rounded-[4px] border border-borderDark bg-deep px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted">
      {text}
    </span>
  );
}

export default function ConversionSections({
  idPrefix = "conversions",
  headingTag = "h2",
  headingSize = "text-[20px]",
}) {
  const Heading = headingTag;
  const sections = buildConversionSections();

  return (
    <>
      {sections.map((section) => (
        <section key={section.key} aria-labelledby={`${idPrefix}-${section.key}`}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Heading
              id={`${idPrefix}-${section.key}`}
              className={`font-display ${headingSize} font-bold leading-tight text-content`}
            >
              {section.heading}
            </Heading>
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
    </>
  );
}
