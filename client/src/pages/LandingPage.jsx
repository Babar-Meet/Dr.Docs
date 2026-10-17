import { useState } from "react";
import { TOOLS } from "../lib/toolConfig";
import TagBar from "../components/landing/TagBar";
import ToolGrid from "../components/landing/ToolGrid";
import { toolsForTag } from "../components/landing/LandingData";

export default function LandingPage() {
  const [tag, setTag] = useState("all");
  const tools = toolsForTag(TOOLS, tag);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="sr-only">All tools</h1>
      <TagBar active={tag} onChange={setTag} />
      <ToolGrid tools={tools} />
    </main>
  );
}
