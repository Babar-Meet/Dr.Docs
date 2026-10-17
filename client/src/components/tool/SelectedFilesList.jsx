import Panel from "../ui/Panel";
import { formatBytes, getExtension } from "../../lib/fileUtils";
import FileTypeIcon from "./FileTypeIcon";

export default function SelectedFilesList({ files, onClear }) {
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
          className="rounded-[5px] border border-borderStrong bg-deep px-2.5 py-1 font-body text-xs font-semibold text-offWhite hover:bg-elevated hover:text-white"
        >
          Clear
        </button>
      </div>
      <div className="space-y-0 divide-y divide-borderDark">
        {files.map((file) => (
          <div
            key={`${file.name}-${file.size}`}
            className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
          >
            <FileTypeIcon extension={getExtension(file.name)} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-body text-[13px] font-semibold leading-tight text-white">
                {file.name}
              </p>
              <p className="mt-1 font-mono text-[11px] leading-none text-muted">
                {formatBytes(file.size)} - {file.type || "Unknown MIME"}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-deep px-2 py-1 font-mono text-[11px] text-muted">
              {getExtension(file.name).replace(".", "").toUpperCase() || "FILE"}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
