import ToolTile from "./ToolTile";
import { sentenceFor } from "./LandingData";

export default function ToolGrid({ tools }) {
  if (tools.length === 0) {
    return (
      <p className="mt-6 font-body text-[14px] leading-normal text-muted">
        No tools in this category yet.
      </p>
    );
  }

  return (
    <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tools.map((tool) => (
        <li key={tool.id} className="h-full">
          <ToolTile tool={tool} sentence={sentenceFor(tool)} />
        </li>
      ))}
    </ul>
  );
}
