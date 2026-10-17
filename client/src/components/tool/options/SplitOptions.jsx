import Panel from "../../ui/Panel.jsx";
import TextInput from "../../ui/TextInput.jsx";

export default function SplitOptions({ pageRanges, setPageRanges }) {
  return (
    <Panel>
      <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
        Split Page Ranges
      </p>
      <TextInput
        value={pageRanges}
        onChange={(event) => setPageRanges(event.target.value)}
        placeholder="Example: 1-3,5,7-10"
        className="mt-3"
      />
      <p className="mt-2 font-body text-xs text-muted">
        Leave empty to split all pages individually.
      </p>
    </Panel>
  );
}
