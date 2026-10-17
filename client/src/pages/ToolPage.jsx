import { LoaderCircle, WandSparkles } from "lucide-react";
import useToolProcess from "../hooks/useToolProcess";
import { GENERIC_CONVERT, liveTools } from "../lib/toolConfig";
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

  // Every live route is counted, including the generic convert hub, which is a
  // live route but not a tile in TOOLS.
  const counterTools = [...liveTools(), GENERIC_CONVERT];
  const index = counterTools.findIndex((item) => item.id === tool.id) + 1;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <ToolIntro tool={tool} index={index} total={counterTools.length} />
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
          <SelectedFilesList files={state.selectedFiles} onClear={state.clearFiles} />
        </div>

        <aside className="space-y-4">
          <OptionsPanel
            kind={tool.operation}
            state={state}
            files={state.selectedFiles}
            operation={tool.operation}
            targetFormatLocked={state.targetFormatLocked}
          />

          <button
            type="button"
            onClick={state.submit}
            disabled={!state.canSubmit}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[5px] bg-orange px-5 py-3 font-display text-[13px] font-bold leading-none text-black transition hover:bg-orangeSoft active:bg-orangeDark disabled:cursor-not-allowed disabled:border disabled:border-borderDark disabled:bg-elevated disabled:text-muted"
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

          <StatusPanel status={state.status} />
          <SecurityNote />
          <LimitsCard />
        </aside>
      </div>

      <RelatedTools tool={tool} />
    </main>
  );
}
