import { ArrowDown } from "lucide-react";

const TRUST_LINES = [
  "No account and no sign-up. Upload and process in one step.",
  "Uploads and work files are deleted when the job ends.",
  "Download links are single use and expire after 30 minutes.",
];

export default function Hero() {
  return (
    <section className="pb-8 pt-2">
      <h1 className="max-w-[26ch] font-display text-[32px] font-bold leading-[1.05] tracking-tight text-white sm:text-[48px]">
        All the PDF tools in one place.
      </h1>
      <p className="mt-4 max-w-[80ch] font-body text-[15px] font-normal leading-[1.5] text-offWhite">
        Every tool in the standard PDF toolbox is listed on this page. The tools that run here link
        to a working page where you upload a file and process it. The tools that are not built yet
        are marked Not available and cannot be clicked.
      </p>

      <ul className="mt-5 grid gap-2 rounded-[5px] border border-borderDark bg-deep p-3 sm:grid-cols-3">
        {TRUST_LINES.map((line) => (
          <li key={line} className="font-mono text-[11px] leading-[1.4] text-muted">
            {line}
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <a
          href="#organize"
          className="inline-flex items-center gap-2 rounded-[5px] bg-orange px-5 py-3 font-display text-[13px] font-bold leading-none text-black transition hover:bg-orangeSoft active:bg-orangeDark"
        >
          <ArrowDown className="h-4 w-4" />
          Browse all tools
        </a>
        <a
          href="#coverage"
          className="inline-flex items-center gap-2 rounded-[5px] border border-borderStrong bg-deep px-4 py-3 font-display text-[13px] font-bold leading-none text-white transition hover:border-[#666666] hover:bg-elevated"
        >
          Compare tool by tool
        </a>
      </div>
    </section>
  );
}
