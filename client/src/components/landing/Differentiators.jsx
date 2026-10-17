import { Activity, FileOutput, Gauge, ShieldAlert, Trash2, UserX } from "lucide-react";
import Panel from "../ui/Panel";

const CLAIMS = [
  {
    icon: UserX,
    claim: "No account and no sign-up.",
    body: "There is no login, no user database, and no analytics. Upload a file, process it, download the result.",
  },
  {
    icon: Gauge,
    claim: "50 MB per file, 200 files per request.",
    body: "An upload request accepts up to 200 files, and a file heavier than 50 MB is rejected before it is processed.",
  },
  {
    icon: Activity,
    claim: "Two jobs run at a time.",
    body: "Every request goes through one queue with two workers, so a large batch cannot overload the machine running the tools.",
  },
  {
    icon: Trash2,
    claim: "Files are deleted, not archived.",
    body: "Uploads and the per-job work directory are removed when the job ends. An output exists only as a download link, and that link is single use and expires after 30 minutes.",
  },
  {
    icon: ShieldAlert,
    claim: "Encryption is never bypassed.",
    body: "A password-protected PDF is reported as password protected, not as a corrupt file. The server never cracks, guesses, or works around strong encryption in any file type.",
  },
  {
    icon: FileOutput,
    claim: "Output names are deterministic.",
    body: "A merge always produces merged_files_processed.pdf, and split parts follow the pattern name_part_2_page_5.pdf or name_part_3_pages_7-10.pdf.",
  },
];

export default function Differentiators() {
  return (
    <section className="pt-12">
      <div className="border-b border-borderDark pb-3">
        <h2 className="font-display text-[26px] font-bold leading-[1.1] tracking-tight text-white sm:text-[36px]">
          What is different here
        </h2>
        <p className="mt-1 max-w-[90ch] font-body text-[13px] leading-normal text-muted">
          Each line below is a behaviour in this codebase, not a promise. The numbers come from the
          server configuration and the processors that run the jobs.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CLAIMS.map((entry) => {
          const Icon = entry.icon;

          return (
            <Panel key={entry.claim} className="flex flex-col gap-2">
              <Icon className="h-5 w-5 shrink-0 text-muted" />
              <p className="break-words font-display text-[14px] font-bold leading-tight text-white">
                {entry.claim}
              </p>
              <p className="break-words font-body text-[13px] leading-normal text-offWhite">
                {entry.body}
              </p>
            </Panel>
          );
        })}
      </div>
    </section>
  );
}
