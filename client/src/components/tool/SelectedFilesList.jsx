import { ArrowDown, ArrowUp, X } from "lucide-react";
import Panel from "../ui/Panel";
import { fileKey, formatBytes, getExtension } from "../../lib/fileUtils";
import FileTypeIcon from "./FileTypeIcon";

// The one place the user sees exactly what they are about to process: a local
// thumbnail or page count, an upfront verdict on password protection and
// refused file types, and for multi-file tools the running order with
// rearrange controls. Nothing here sends bytes anywhere before Process.
export default function SelectedFilesList({
  files,
  inspections = {},
  reorderable = false,
  onReorder,
  onRemove,
  onClear,
}) {
  if (files.length === 0) return null;

  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          Selected files - {files.length}
        </p>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onClear();
          }}
          className="rounded-[5px] border border-borderStrong bg-deep px-2.5 py-1 font-body text-xs font-semibold text-offWhite hover:bg-elevated hover:text-content"
        >
          Clear
        </button>
      </div>
      {reorderable && files.length > 1 && (
        <p className="mb-2 font-body text-[11px] text-muted">
          Files keep this order when the tool runs. Use the arrows to rearrange.
        </p>
      )}
      <div className="space-y-0 divide-y divide-borderDark">
        {files.map((file, index) => {
          const info = inspections[fileKey(file)] || {};
          const extension = getExtension(file.name);

          return (
            <div
              key={`${file.name}-${file.size}`}
              className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
            >
              {reorderable && (
                <span className="mt-1 w-5 shrink-0 text-center font-mono text-[11px] leading-none text-muted">
                  {index + 1}
                </span>
              )}
              {info.objectUrl ? (
                <img
                  src={info.objectUrl}
                  alt={`Preview of ${file.name}`}
                  className="h-10 w-10 shrink-0 rounded-[4px] border border-borderDark object-cover"
                />
              ) : (
                <FileTypeIcon extension={extension} />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-body text-[13px] font-semibold leading-tight text-content">
                  {file.name}
                </p>
                <p className="mt-1 font-mono text-[11px] leading-none text-muted">
                  {formatBytes(file.size)} - {file.type || "Unknown MIME"}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {info.pages > 0 && (
                    <span className="rounded-full border border-borderDark bg-deep px-2 py-0.5 font-mono text-[10px] font-medium text-offWhite">
                      {info.pages} page{info.pages === 1 ? "" : "s"}
                    </span>
                  )}
                  {info.encrypted && (
                    <span className="rounded-full border border-orange bg-deep px-2 py-0.5 font-mono text-[10px] font-medium text-orange">
                      Password protected
                    </span>
                  )}
                  {info.damaged && (
                    <span className="rounded-full border border-borderStrong bg-deep px-2 py-0.5 font-mono text-[10px] font-medium text-offWhite">
                      {info.damaged}
                    </span>
                  )}
                  {info.rejected && (
                    <span className="font-body text-[11px] font-medium leading-snug text-orange">
                      {info.rejected}
                    </span>
                  )}
                </div>
              </div>
              {reorderable && (
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    aria-label={`Move ${file.name} up`}
                    disabled={index === 0}
                    onClick={(event) => {
                      event.stopPropagation();
                      onReorder(index, -1);
                    }}
                    className="rounded-[4px] border border-borderDark bg-deep p-1 text-muted transition hover:border-borderStrong hover:text-content disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${file.name} down`}
                    disabled={index === files.length - 1}
                    onClick={(event) => {
                      event.stopPropagation();
                      onReorder(index, 1);
                    }}
                    className="rounded-[4px] border border-borderDark bg-deep p-1 text-muted transition hover:border-borderStrong hover:text-content disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {reorderable && (
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(index);
                  }}
                  className="mt-1 shrink-0 rounded-[4px] border border-borderDark bg-deep p-1 text-muted transition hover:border-borderStrong hover:text-content"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {!reorderable && (
                <span className="shrink-0 rounded-full bg-deep px-2 py-1 font-mono text-[11px] text-muted">
                  {extension.replace(".", "").toUpperCase() || "FILE"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
