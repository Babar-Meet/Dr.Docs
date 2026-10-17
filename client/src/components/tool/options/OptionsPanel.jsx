import ConvertOptions from "./ConvertOptions.jsx";
import MergeOptions from "./MergeOptions.jsx";
import SplitOptions from "./SplitOptions.jsx";
import RotateOptions from "./RotateOptions.jsx";

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
        rotationAngle={state.rotationAngle}
        setRotationAngle={state.setRotationAngle}
        pages={state.pages}
        setPages={state.setPages}
        pdfPages={singlePdfPages}
      />
    );
  }

  return null;
}
