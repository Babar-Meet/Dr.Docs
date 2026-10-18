import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import ThemeToggle from "./ThemeToggle.jsx";
import { GENERIC_CONVERT, GROUP_ORDER, TOOL_GROUPS, TOOLS } from "../../lib/toolConfig";

// One grouped menu with every tool, mirroring the reference product's header:
// brand on the left, a tools dropdown, account actions on the right. Queued
// tools stay in the menu with a Coming soon mark so the roadmap is visible.
export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const location = useLocation();

  // Menu state resets on navigation and closes when clicking outside or on Escape.
  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const grouped = GROUP_ORDER.map((group) => {
    const items = TOOLS.filter((tool) => tool.group === group);
    if (group === "convert") items.push(GENERIC_CONVERT);
    return { group, items };
  }).filter((entry) => entry.items.length > 0);

  return (
    <header className="sticky top-0 z-30 border-b border-borderDark bg-panel">
      {/* Midnight Orange spec: Ink Black #0B0B0B, 56-64px, border #333333 */}
      <div className="mx-auto flex h-[60px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            aria-label="Dr.Docs home"
            className="flex items-center gap-3 rounded-[5px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-[5px] bg-orange text-sm font-bold text-black">
              D
            </div>
            <p className="font-display text-[15px] font-bold leading-none tracking-tight text-content">
              Dr.Docs
            </p>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className={
                "inline-flex items-center gap-2 rounded-[5px] border px-3 py-2 font-body text-[13px] font-bold leading-none transition " +
                (menuOpen
                  ? "border-orange bg-panel text-orange"
                  : "border-borderStrong bg-panel text-offWhite hover:border-[#666666] hover:text-content")
              }
            >
              PDF tools
              <ChevronDown
                className={"h-3.5 w-3.5 transition " + (menuOpen ? "rotate-180" : "")}
              />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+8px)] z-40 max-h-[70vh] w-72 overflow-y-auto rounded-[6px] border border-borderStrong bg-panel p-2 shadow-lg"
              >
                {grouped.map(({ group, items }) => (
                  <div key={group} className="mb-1 last:mb-0">
                    <p className="px-2 pb-1 pt-2 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted first:pt-1">
                      {TOOL_GROUPS[group].title}
                    </p>
                    {items.map((tool) => {
                      const Icon = tool.icon;
                      if (!tool.available) {
                        return (
                          <span
                            key={tool.id}
                            title={`${tool.label} - coming soon`}
                            className="flex cursor-not-allowed select-none items-center justify-between gap-2 rounded-[5px] px-2 py-2 font-body text-[13px] font-semibold text-muted"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <Icon className="h-4 w-4 shrink-0" />
                              <span className="truncate">{tool.label}</span>
                            </span>
                            <span className="shrink-0 rounded-full border border-borderDark bg-deep px-2 py-0.5 font-mono text-[10px] font-medium text-muted">
                              Coming soon
                            </span>
                          </span>
                        );
                      }
                      return (
                        <Link
                          key={tool.id}
                          role="menuitem"
                          to={`/${tool.slug}`}
                          className="flex items-center gap-2 rounded-[5px] px-2 py-2 font-body text-[13px] font-semibold text-offWhite transition hover:bg-elevated hover:text-content"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-muted" />
                          {tool.label}
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
