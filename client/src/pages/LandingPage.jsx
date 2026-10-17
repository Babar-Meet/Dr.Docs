import { GENERIC_CONVERT, TOOLS, toolsByGroup } from "../lib/toolConfig";
import Hero from "../components/landing/Hero";
import GroupNav from "../components/landing/GroupNav";
import ToolGrid from "../components/landing/ToolGrid";
import CoverageLedger from "../components/landing/CoverageLedger";
import Differentiators from "../components/landing/Differentiators";

export default function LandingPage() {
  const groups = toolsByGroup();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Hero />
      <GroupNav groups={groups} />
      <ToolGrid groups={groups} hub={GENERIC_CONVERT} />
      <CoverageLedger tools={TOOLS} hub={GENERIC_CONVERT} />
      <Differentiators />
    </main>
  );
}
