import Panel from "../../ui/Panel.jsx";
import Select from "../../ui/Select.jsx";
import { MERGE_TARGETS } from "../../../lib/conversionTargets.js";

export default function MergeOptions({ targetFormat, setTargetFormat }) {
  return (
    <Panel>
      <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
        Merge Output Format
      </p>
      <Select
        value={targetFormat}
        onChange={(event) => setTargetFormat(event.target.value)}
        className="mt-3"
      >
        {MERGE_TARGETS.map((target) => (
          <option key={target} value={target}>
            .{target}
          </option>
        ))}
      </Select>
      <p className="mt-2 font-body text-xs text-muted">
        Mixed files merge into one PDF or DOCX.
      </p>
    </Panel>
  );
}
