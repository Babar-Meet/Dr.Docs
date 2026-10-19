import ConvertOptions from "./ConvertOptions.jsx";
import MergeOptions from "./MergeOptions.jsx";
import SplitOptions from "./SplitOptions.jsx";
import RotateOptions from "./RotateOptions.jsx";
import ProtectOptions from "./ProtectOptions.jsx";
import UnlockOptions from "./UnlockOptions.jsx";
import WatermarkOptions from "./WatermarkOptions.jsx";
import PageNumbersOptions from "./PageNumbersOptions.jsx";

// ToolRecord.kind is "info" for compress, ocr and repair; those tools
// have no selectable options, so they render no panel here. Their per-engine
// notes live in ToolPage's About section. Unlock renders a panel too: it is
// the one tool where a password-locked PDF can be opened with its password.

export default function OptionsPanel({
  kind,
  state = {},
  files = [],
  operation = "",
  singlePdfPages = null,
}) {
  const resolvedKind = kind && kind !== "info" ? kind : operation;

  if (resolvedKind === "convert") {
    return (
      <ConvertOptions
        targetFormat={state.targetFormat}
        setTargetFormat={state.setTargetFormat}
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
        file={files[0] || null}
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

  if (resolvedKind === "unlock") {
    return (
      <UnlockOptions
        password={state.password}
        setPassword={state.setPassword}
      />
    );
  }

  if (resolvedKind === "watermark") {
    return (
      <WatermarkOptions
        watermarkText={state.watermarkText}
        setWatermarkText={state.setWatermarkText}
        watermarkAngle={state.watermarkAngle}
        setWatermarkAngle={state.setWatermarkAngle}
        watermarkOpacity={state.watermarkOpacity}
        setWatermarkOpacity={state.setWatermarkOpacity}
        watermarkType={state.watermarkType}
        setWatermarkType={state.setWatermarkType}
        file={state.selectedFiles[0]}
      />
    );
  }

  if (resolvedKind === "pagenumbers") {
    return (
      <PageNumbersOptions
        pageNumberPosition={state.pageNumberPosition}
        setPageNumberPosition={state.setPageNumberPosition}
        pageNumberMargin={state.pageNumberMargin}
        setPageNumberMargin={state.setPageNumberMargin}
        file={state.selectedFiles[0]}
      />
    );
  }

  return null;
}
