import Panel from "../../ui/Panel.jsx";
import Select from "../../ui/Select.jsx";

export default function ConvertOptions({
  targetFormat,
  setTargetFormat,
  targetFormatLocked = false,
  convertTargetOptions = [],
  files = [],
}) {
  const hasTargets = convertTargetOptions.length > 0;

  // A named pair route locks the target, so the field is read-only.
  if (targetFormatLocked) {
    return (
      <Panel>
        <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          Convert Target
        </p>
        <Select
          value={targetFormat}
          onChange={() => {}}
          disabled
          className="mt-3"
        >
          <option value={targetFormat}>.{targetFormat}</option>
        </Select>
        <p className="mt-2 font-body text-xs text-muted">
          Target is fixed on this page.
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
        Convert Target
      </p>
      <Select
        value={targetFormat}
        onChange={(event) => setTargetFormat(event.target.value)}
        disabled={!hasTargets}
        className="mt-3"
      >
        {!hasTargets && (
          <option value="">Not available - select supported files</option>
        )}
        {convertTargetOptions.map((target) => (
          <option key={target} value={target}>
            .{target}
          </option>
        ))}
      </Select>
      {!hasTargets && (
        <p className="mt-2 font-body text-xs text-muted">
          No common target for current files. Add compatible files.
        </p>
      )}
    </Panel>
  );
}
