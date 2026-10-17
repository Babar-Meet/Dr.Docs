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
        </div>
      </div>

      {status.kind === "success" && status.batchDownloadUrl && (
        <a
          href={status.batchDownloadUrl}
          download
          className="mt-4 inline-flex items-center gap-2 rounded-[5px] bg-orange px-4 py-2 font-display text-[13px] font-bold text-black transition hover:bg-orangeSoft"
        >
          <Download className="h-4 w-4" />
          Download All
        </a>
      )}

      {status.kind === "success" && status.results?.length > 0 && (
        <div className="mt-4 space-y-2">
          {status.results.map((item) => (
            <div
              key={item.downloadId}
              className="flex items-center justify-between gap-3 rounded-[5px] border border-success/30 bg-ink/40 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate font-body text-xs font-semibold text-white">
                  {item.downloadName}
                </p>
                <p className="truncate font-mono text-[11px] text-successText/70">
                  {item.message}
                </p>
              </div>
              <a
                href={buildEndpoint(item.downloadUrl)}
                download={item.downloadName}
                className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-[5px] bg-success px-2.5 py-1.5 font-display text-xs font-bold text-black hover:bg-[#1a9c4a]"
              >
                <Download className="h-3 w-3" />
                Download
              </a>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
