import ConvertOptions from "./ConvertOptions.jsx";
import MergeOptions from "./MergeOptions.jsx";
import SplitOptions from "./SplitOptions.jsx";
import RotateOptions from "./RotateOptions.jsx";
import ProtectOptions from "./ProtectOptions.jsx";

// ToolRecord.kind is "info" for compress, unlock, ocr and repair; those tools
// have no selectable options, so they render no panel here. Their per-engine
// notes live in ToolPage's About section.

export default function OptionsPanel({
  kind,
  state = {},
  files = [],
  operation = "",
  targetFormatLocked = false,
  singlePdfPages = null,
}) {
  const resolvedKind = kind && kind !== "info" ? kind : operation;

  if (resolvedKind === "convert") {
    return (
      <ConvertOptions
        targetFormat={state.targetFormat}
        setTargetFormat={state.setTargetFormat}
        targetFormatLocked={targetFormatLocked}
        convertTargetOptions={state.convertTargetOptions}
        files={files}
      />
    );
  }

  if (resolvedKind === "merge") {
    return (
      <MergeOptions
        targetFormat={state.targetFormat}
        setTargetFormat={state.setTargetFormat}
      />
    );
  }

  if (resolvedKind === "split") {
    return (
      <SplitOptions
        pageRanges={state.pageRanges}
        setPageRanges={state.setPageRanges}
        pdfPages={singlePdfPages}
      />
    );
  }

  if (resolvedKind === "rotate") {
    return (
      <RotateOptions
        mode={state.rotateMode}
        setMode={state.setRotateMode}
        allDelta={state.rotateAllDelta}
        onRotateAll={state.pressRotateAll}
        pageRotations={state.pageRotations}
        setPageRotation={state.setPageRotation}
        onResetPages={state.resetPageRotations}
        file={files[0] || null}
        pdfPages={singlePdfPages}
      />
    );
  }

  if (resolvedKind === "protect") {
    return (
      <ProtectOptions
        password={state.password}
        setPassword={state.setPassword}
      />
    );
  }

  return null;
}
