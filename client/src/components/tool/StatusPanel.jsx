import { CheckCircle2, Download, XCircle } from "lucide-react";
import { buildEndpoint } from "../../lib/api";

export default function StatusPanel({ status }) {
  if (!status) return null;

  return (
    <section
      className={
        "rounded-[6px] border p-4 " +
        (status.kind === "success"
          ? "border-success bg-successBg"
          : "border-error bg-errorBg")
      }
    >
      <div className="flex items-start gap-3">
        {status.kind === "success" ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
        ) : (
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-error" />
        )}
        <div className="min-w-0 space-y-1">
          <p
            className={
              "font-display text-[13px] font-bold leading-tight " +
              (status.kind === "success" ? "text-successText" : "text-errorText")
            }
          >
            {status.message}
          </p>
          {status.reason && (
            <p
              className={
                "font-body text-[13px] leading-normal " +
                (status.kind === "success" ? "text-successText/80" : "text-errorText/80")
              }
            >
              {status.reason}
            </p>
          )}
          {status.hint && (
            <p className="font-body text-[12px] font-semibold leading-normal text-orange">
              {status.hint}
            </p>
          )}
        </div>
      </div>

      {status.kind === "success" && status.results?.length > 0 && (
        <div className="mt-4 space-y-2">
          {status.results.map((item) => (
            <div
              key={item.downloadId}
              className="flex items-center justify-between gap-3 rounded-[5px] border border-success/30 bg-deep/60 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate font-body text-xs font-semibold text-content">
                  {item.downloadName}
                </p>
                <p className="truncate font-mono text-[11px] text-successText/70">
                  {item.message}
                </p>
              </div>
              {/* The primary button above already downloads everything (the
                  ZIP when a batch produced several files). Rows carry their
                  own file button only in that batch case, so a user can grab
                  one specific file instead. Single output: one button total. */}
              {status.results.length > 1 && (
                <a
                  href={buildEndpoint(item.downloadUrl)}
                  download={item.downloadName}
                  className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-[5px] bg-success px-2.5 py-1.5 font-display text-xs font-bold text-black hover:bg-success/85"
                >
                  <Download className="h-3 w-3" />
                  Download
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
