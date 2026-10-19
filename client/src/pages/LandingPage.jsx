import { useState } from "react";
import { TOOLS } from "../lib/toolConfig";
import TagBar from "../components/landing/TagBar";
import ToolGrid from "../components/landing/ToolGrid";
import { toolSections } from "../components/landing/LandingData";

export default function LandingPage() {
  const [tag, setTag] = useState("all");
  // One labeled section per category, like the Conversions page groups by
  // source format. A tag filter narrows the page to that group's section.
  const sections = toolSections(TOOLS, tag);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="sr-only">All tools</h1>
      <TagBar active={tag} onChange={setTag} />
      {sections.length === 0 ? (
        <p className="mt-6 font-body text-[14px] leading-normal text-muted">
          No tools in this category yet.
        </p>
      ) : (
        <div className="flex flex-col gap-10">
          {sections.map((section) => (
            <section key={section.group} aria-labelledby={`landing-${section.group}`}>
              <h2
                id={`landing-${section.group}`}
                className="font-display text-[20px] font-bold leading-tight text-content"
              >
                {section.title}
              </h2>
              <ToolGrid tools={section.tools} />
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
