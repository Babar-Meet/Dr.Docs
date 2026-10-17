import Panel from "../../ui/Panel.jsx";
import Select from "../../ui/Select.jsx";
import TextInput from "../../ui/TextInput.jsx";
import { maxPageInRanges } from "../../../lib/fileUtils";

export default function RotateOptions({
  rotationAngle,
  setRotationAngle,
  pages,
  setPages,
  pdfPages,
}) {
  const pageHint = (() => {
    if (pdfPages === null) return "";
    const trimmed = pages.trim();
    if (trimmed === "" || trimmed.toLowerCase() === "all") return "";
    const highest = maxPageInRanges(trimmed);
    if (highest === 0) return "";
    if (highest > pdfPages) {
      return `Page ranges go past the last page (${pdfPages} pages in this file).`;
    }
    return "";
  })();

  return (
    <Panel>
      <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
        Rotate Options
      </p>
      <label className="mt-3 block font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
        Rotation Angle
      </label>
      <Select
        value={rotationAngle}
        onChange={(event) => setRotationAngle(event.target.value)}
        className="mt-1.5"
      >
        <option value="90">90deg - Quarter turn</option>
        <option value="180">180deg - Half turn</option>
        <option value="270">270deg - Three quarter</option>
      </Select>
      <label className="mt-3 block font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
        Pages
      </label>
      {pdfPages !== null && (
        <p className="mt-2 font-body text-[11px] text-muted">
          This file has {pdfPages} page{pdfPages === 1 ? "" : "s"}.
        </p>
      )}
      <TextInput
        value={pages}
        onChange={(event) => setPages(event.target.value)}
        placeholder="all or 1,3-5,8"
        className="mt-1.5"
      />
      {pageHint ? (
        <p className="mt-2 font-body text-xs font-semibold text-orange">{pageHint}</p>
      ) : (
        <p className="mt-2 font-body text-xs text-muted">
          Use "all" or list pages like 1,3-5,8.
        </p>
      )}
    </Panel>
  );
}
