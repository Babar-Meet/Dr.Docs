import { useState } from "react";
import { TOOLS } from "../lib/toolConfig";
import TagBar from "../components/landing/TagBar";
import ToolGrid from "../components/landing/ToolGrid";
import ConversionSections from "../components/conversions/ConversionSections";
import { toolSections } from "../components/landing/LandingData";

// The Any To Any conversion category as part of the All view: the full
// per-source section list from the conversion hub data, one heading level up
// from the landing's other sections so the hierarchy stays right.
function ConvertAnyToAnyBlock() {
  return (
    <section aria-labelledby="landing-convert-any">
      <h2
        id="landing-convert-any"
        className="font-display text-[20px] font-bold leading-tight text-content"
      >
        Convert Any To Any
      </h2>
      <div className="mt-4 flex flex-col gap-6">
        <ConversionSections idPrefix="landing-convert" headingTag="h3" headingSize="text-[16px]" />
      </div>
    </section>
  );
}

function ToolSection({ section }) {
  return (
    <section key={section.group} aria-labelledby={`landing-${section.group}`}>
      <h2
        id={`landing-${section.group}`}
        className="font-display text-[20px] font-bold leading-tight text-content"
      >
        {section.title}
      </h2>
      <ToolGrid tools={section.tools} />
    </section>
  );
}

export default function LandingPage() {
  const [tag, setTag] = useState("all");
  const sections = toolSections(TOOLS, tag);
  const isAll = !tag || tag === "all";

  // All view order: Organize, Optimize, the Convert Any To Any block, Edit,
  // PDF Security. A tag filter shows one section and never the block: the
  // Convert chip is a link to the dedicated Conversions page, not a filter.
  const before = sections.filter(
    (section) => section.group === "organize" || section.group === "optimize",
  );
  const after = sections.filter(
    (section) => section.group === "edit" || section.group === "security",
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="sr-only">All tools</h1>
      <TagBar active={tag} onChange={setTag} />
      {sections.length === 0 ? (
        <p className="mt-6 font-body text-[14px] leading-normal text-muted">
          No tools in this category yet.
        </p>
      ) : isAll ? (
        <div className="flex flex-col gap-10">
          {before.map((section) => (
            <ToolSection key={section.group} section={section} />
          ))}
          <ConvertAnyToAnyBlock />
          {after.map((section) => (
            <ToolSection key={section.group} section={section} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {sections.map((section) => (
            <ToolSection key={section.group} section={section} />
          ))}
        </div>
      )}
    </main>
  );
}
