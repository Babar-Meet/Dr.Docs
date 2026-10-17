import ConvertOptions from "./ConvertOptions.jsx";
import MergeOptions from "./MergeOptions.jsx";
import SplitOptions from "./SplitOptions.jsx";
import RotateOptions from "./RotateOptions.jsx";
import InfoOptions from "./InfoOptions.jsx";

// ToolRecord.kind is "info" for compress, unlock, ocr and repair, so the four
// informational panels cannot be told apart from `kind` alone. OptionsPanel
// therefore reads the tool's operation as well: either pass `kind` as the
// operation (for example kind="compress") or pass the record's kind plus the
// optional `operation` prop.
const INFO_KINDS = ["compress", "unlock", "ocr", "repair"];

export default function OptionsPanel({
  kind,
  state = {},
  files = [],
  operation = "",
  targetFormatLocked = false,
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
      />
    );
  }

  if (INFO_KINDS.includes(resolvedKind)) {
    return <InfoOptions kind={resolvedKind} />;
  }

  return null;
}
