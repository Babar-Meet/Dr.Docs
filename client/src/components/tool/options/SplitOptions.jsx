import Panel from "../../ui/Panel.jsx";
import TextInput from "../../ui/TextInput.jsx";
import { maxPageInRanges } from "../../../lib/fileUtils";

export default function SplitOptions({ pageRanges, setPageRanges, pdfPages }) {
  const pastEnd =
    pdfPages !== null &&
    pageRanges.trim() !== "" &&
    maxPageInRanges(pageRanges) > pdfPages;

  return (
    <Panel>
      <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
        Split Page Ranges
      </p>
      {pdfPages !== null && (
        <p className="mt-2 font-body text-[11px] text-muted">
          This file has {pdfPages} page{pdfPages === 1 ? "" : "s"}.
        </p>
      )}
      <TextInput
        value={pageRanges}
        onChange={(event) => setPageRanges(event.target.value)}
        placeholder="Example: 1-3,5,7-10"
        className="mt-3"
      />
      {pastEnd ? (
        <p className="mt-2 font-body text-xs font-semibold text-orange">
          Page ranges go past the last page ({pdfPages} pages in this file).
        </p>
      ) : (
        <p className="mt-2 font-body text-xs text-muted">
          Leave empty to split all pages individually.
        </p>
      )}
    </Panel>
  );
}
