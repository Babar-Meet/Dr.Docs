import {
  CheckCircle2,
  Download,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  WandSparkles,
} from "lucide-react";
import useToolProcess from "../hooks/useToolProcess";
import DropZone from "../components/tool/DropZone";
import LimitsCard from "../components/tool/LimitsCard";
import RelatedTools from "../components/tool/RelatedTools";
import SecurityNote from "../components/tool/SecurityNote";
import SelectedFilesList from "../components/tool/SelectedFilesList";
import StatusPanel from "../components/tool/StatusPanel";
import ToolIntro from "../components/tool/ToolIntro";
import OptionsPanel from "../components/tool/options/OptionsPanel";

export default function ToolPage({ tool }) {
  // Keyed on the tool so a route change remounts the runtime and no job state
  // from the previous tool survives.
  return <ToolRuntime key={tool.id} tool={tool} />;
}

function ToolRuntime({ tool }) {
  const state = useToolProcess(tool);
  const hasFiles = state.selectedFiles.length > 0;
  // After a successful run the action button becomes Download and a second
  // Start over from scratch resets everything including the picked files, so
  // the two buttons say exactly what they do: process again keeps the files,
  // start over from scratch throws them away.
  // Unlock joins this list for the Password box: it is the one place a
  // password-locked PDF can be opened with its original password.
  const hasOptionControls = [
    "convert",
    "merge",
    "split",
    "rotate",
    "protect",
    "unlock",
    "watermark",
    "pagenumbers",
  ].includes(tool.operation);
  const hasResult = Boolean(state.resultDownloadUrl);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 lg:max-w-4xl 2xl:max-w-5xl">
      <div className="flex min-h-[calc(100svh-200px)] flex-col justify-center">
        <ToolIntro tool={tool} />

        <div className="mt-6">
          <DropZone
            multiple={tool.multiple}
            accept={tool.accept}
            dragActive={state.dragActive}
            fileInputRef={state.fileInputRef}
            onPickFiles={state.onPickFiles}
            onDragOver={state.onDragOver}
            onDragLeave={state.onDragLeave}
            onDrop={state.onDrop}
            singlePdfHint={!tool.multiple}
          />
        </div>

        <div className="mt-4">
          <SelectedFilesList
            files={state.selectedFiles}
            inspections={state.inspections}
            reorderable={tool.multiple}
            onReorder={state.reorderFiles}
            onRemove={state.removeFile}
            onClear={state.clearFiles}
          />
        </div>

        {hasOptionControls && hasFiles && (
          <div className="mt-4">
            <OptionsPanel
              kind={tool.operation}
              state={state}
              files={state.selectedFiles}
              operation={tool.operation}
              targetFormatLocked={state.targetFormatLocked}
              singlePdfPages={state.singlePdfPages}
            />
          </div>
        )}

        {hasFiles && (
          <div className="mt-4">
            {hasResult ? (
              <div className="flex gap-2">
                <a
                  href={state.resultDownloadUrl}
                  download
                  onClick={state.markResultDownloaded}
                  className={
                    "flex flex-1 items-center justify-center gap-2 rounded-[5px] bg-success px-5 py-3.5 font-display text-[14px] font-bold leading-none text-black transition hover:bg-success/85 " +
                    (state.resultDownloaded
                      ? "pointer-events-none cursor-default bg-success/70"
                      : "")
                  }
                >
                  {state.resultDownloaded ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Downloaded
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      {state.status?.batchDownloadUrl ? "Download All" : "Download"}
                    </>
                  )}
                </a>
                <button
                  type="button"
                  onClick={state.submit}
                  disabled={state.isProcessing}
                  className="inline-flex items-center justify-center gap-2 rounded-[5px] border border-borderStrong bg-deep px-5 py-3.5 font-display text-[14px] font-bold leading-none text-offWhite transition hover:bg-elevated hover:text-content disabled:cursor-default disabled:text-muted"
                >
                  <RefreshCw className="h-4 w-4" />
                  Process files again
                </button>
                <button
                  type="button"
                  onClick={state.clearFiles}
                  className="inline-flex items-center justify-center gap-2 rounded-[5px] border border-borderStrong bg-deep px-5 py-3.5 font-display text-[14px] font-bold leading-none text-offWhite transition hover:bg-elevated hover:text-content"
                >
                  <RotateCcw className="h-4 w-4" />
                  Start over from scratch
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={state.submit}
                disabled={!state.canSubmit}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[5px] bg-orange px-5 py-3.5 font-display text-[14px] font-bold leading-none text-black transition hover:bg-orangeSoft active:bg-orangeDark disabled:cursor-not-allowed disabled:border disabled:border-borderDark disabled:bg-elevated disabled:text-muted"
              >
                {state.isProcessing ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <WandSparkles className="h-4 w-4" />
                    Process Files
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {hasFiles && state.rejectedCount > 0 && !state.isProcessing && (
          <p className="mt-2 text-center font-body text-[12px] text-orange">
            Remove the flagged file{state.rejectedCount === 1 ? "" : "s"} to
            enable processing.
          </p>
        )}

        <div className="mt-4">
          <StatusPanel status={state.status} />
        </div>
      </div>

      <hr className="mt-10 border-borderDark/60" />

      <ToolAbout tool={tool} />

      <div className="mt-4">
        <SecurityNote />
      </div>

      <div className="mt-4">
        <LimitsCard />
      </div>

      <RelatedTools tool={tool} />
    </main>
  );
}

// Engine notes that state one measurable fact about the operation code. Only
// listed where the tool's detail paragraph does not already carry it.
const TOOL_NOTES = {
  compress: ["PDFs only. Batch up to 200 files. Encrypted files are never bypassed."],
  ocr: ["Uses Tesseract. English trained data is included (eng.traineddata)."],
  repair: [
    "PDF: rebuilt and linearized with qpdf.",
    "DOCX, PPTX: package validated and rewritten.",
    "XLSX: workbook reloaded and rewritten.",
    "ZIP: validated and rebuilt.",
    "JPG, JPEG, PNG: decoded and re-encoded.",
    "Data that is already lost cannot be recovered. Encrypted files are never bypassed.",
  ],
};

function ToolAbout({ tool }) {
  const notes = TOOL_NOTES[tool.operation];
  return (
    <div className="mt-8">
      <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
        About this tool
      </p>
      <p className="mt-3 font-body text-[14px] leading-[1.6] text-offWhite">
        {tool.detail}
      </p>
      {notes && (
        <div className="mt-3 space-y-1.5">
          {notes.map((line) => (
            <p key={line} className="font-mono text-[11px] leading-[1.5] text-muted">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
