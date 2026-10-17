import { Link } from "react-router-dom";
import { TOOL_GROUPS } from "../../lib/toolConfig";

const HEADER_CELL =
  "whitespace-nowrap border-b border-borderDark px-3 py-2 text-left font-display text-[12px] font-semibold text-white";
const BODY_CELL = "px-3 py-2 align-top";

export default function CoverageLedger({ tools, hub }) {
  const availableCount = tools.filter((tool) => tool.available).length;
  const unavailableCount = tools.length - availableCount;

  return (
    <section id="coverage" className="scroll-mt-28 pt-12">
      <div className="border-b border-borderDark pb-3">
        <h2 className="font-display text-[26px] font-bold leading-[1.1] tracking-tight text-white sm:text-[36px]">
          Coverage ledger
        </h2>
        <p className="mt-1 max-w-[90ch] font-body text-[13px] leading-normal text-muted">
          The same list as the sections above, in order, in one table: the route to open and the
          server operation behind it. {availableCount} of {tools.length} tools in this list are
          available today, and {unavailableCount} are not built yet.
        </p>
      </div>

      <div className="mt-4 overflow-x-auto rounded-[6px] border border-borderDark bg-ink">
        <table className="w-full min-w-[760px] border-collapse">
          <caption className="sr-only">
            Every tool in the list with its category, route, server operation, and availability.
          </caption>
          <thead className="bg-deep">
            <tr>
              <th scope="col" className={HEADER_CELL}>
                #
              </th>
              <th scope="col" className={HEADER_CELL}>
                Category
              </th>
              <th scope="col" className={HEADER_CELL}>
                Tool
              </th>
              <th scope="col" className={HEADER_CELL}>
                Route
              </th>
              <th scope="col" className={HEADER_CELL}>
                Server operation
              </th>
              <th scope="col" className={HEADER_CELL}>
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {tools.map((tool, index) => (
              <tr
                key={tool.id}
                className="border-b border-borderDark last:border-b-0 hover:bg-elevated"
              >
                <td className={`${BODY_CELL} font-mono text-[11px] text-muted`}>{index + 1}</td>
                <td className={`${BODY_CELL} font-body text-[13px] text-muted`}>
                  {TOOL_GROUPS[tool.group]?.title || tool.group}
                </td>
                <td
                  className={`${BODY_CELL} font-body text-[13px] font-semibold ${
                    tool.available ? "text-white" : "text-muted"
                  }`}
                >
                  {tool.label}
                </td>
                <td className={`${BODY_CELL} whitespace-nowrap font-mono text-[11px]`}>
                  {tool.available ? (
                    <Link to={`/${tool.slug}`} className="text-orange hover:text-orangeSoft">
                      /{tool.slug}
                    </Link>
                  ) : (
                    <span className="text-muted" title="Reserved route - not created yet">
                      /{tool.slug}
                    </span>
                  )}
                </td>
                <td className={`${BODY_CELL} whitespace-nowrap font-mono text-[11px] text-muted`}>
                  {tool.operation || "-"}
                </td>
                <td className={`${BODY_CELL} whitespace-nowrap font-body text-[12px] font-semibold`}>
                  {tool.available ? (
                    <span className="text-white">Available</span>
                  ) : (
                    <span className="font-normal text-muted">Not available</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 font-mono text-[11px] leading-[1.4] text-muted">
        {hub.label} is not a row in this table. It is one general page for every supported pair
        (PDF to ODT, DOCX to EPUB, and so on), so it has no tile in the list above.{" "}
        {hub.available ? (
          <>
            It is live at{" "}
            <Link to={`/${hub.slug}`} className="text-orange hover:text-orangeSoft">
              /{hub.slug}
            </Link>
            .
          </>
        ) : (
          "It is not built yet."
        )}
      </p>
    </section>
  );
}
