import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, Search } from "lucide-react";
import ThemeToggle from "./ThemeToggle.jsx";
import { CONVERSIONS_HUB, GROUP_ORDER, TOOL_GROUPS, TOOLS } from "../../lib/toolConfig";

// One grouped menu with every tool, mirroring the reference product's header:
// brand on the left, a tools picker, theme toggle on the right. The header
// control IS the search field: it stays visible on every page, typing filters
// the list live, and the menu below it is only the grouped results. No search
// box lives inside the dropdown itself. An empty query shows the full list.
// Small search helpers for the tools menu. Matching is word-based with a
// one-letter tolerance ("mar" finds Merge, "rot" finds Rotate), so a stray
// substring in the longer descriptions can never pollute the results. The
// prose only matters when no label or slug matched at all.
function editDistance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + cost,
      );
    }
  }
  return rows[a.length][b.length];
}

function wordMatches(query, word) {
  const tolerance = query.length <= 4 ? 1 : 2;
  return (
    word.startsWith(query) || editDistance(query, word.slice(0, query.length)) <= tolerance
  );
}

function toTokens(tool) {
  return `${tool.label} ${tool.slug}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const menuRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Menu state resets on navigation and closes when clicking outside or on Escape.
  useEffect(() => {
    setMenuOpen(false);
    setQuery("");
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

  // Pressing "/" anywhere jumps straight into the search box, the way
  // Google and YouTube do. Inside a field it just types the slash, and
  // shortcuts with modifiers (like Ctrl+/) are left alone.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const grouped = GROUP_ORDER.map((group) => {
    const items = TOOLS.filter((tool) => tool.group === group);
    if (group === "convert") {
      // The Conversions page entry leads the convert group, then the
      // dedicated pairs. There is no generic converter page: every pair
      // opens its own screen.
      items.unshift(CONVERSIONS_HUB);
    }
    return { group, items };
  }).filter((entry) => entry.items.length > 0);

  const trimmed = query.trim().toLowerCase();
  let filtered =
    trimmed === ""
      ? grouped
      : grouped
          .map(({ group, items }) => ({
            group,
            items: items.filter((tool) =>
              toTokens(tool).some((word) => wordMatches(trimmed, word)),
            ),
          }))
          .filter((entry) => entry.items.length > 0);

  // A query that matched no name still deserves a try against the prose -
  // words like scan or watermark live in the descriptions, not the labels.
  if (trimmed !== "" && filtered.length === 0) {
    filtered = grouped
      .map(({ group, items }) => ({
        group,
        items: items.filter((tool) =>
          `${tool.label} ${tool.slug} ${tool.help || ""}`
            .toLowerCase()
            .includes(trimmed),
        ),
      }))
      .filter((entry) => entry.items.length > 0);
  }

  // Enter jumps straight to the first available match, so "rot" + Enter is
  // already on the Rotate page.
  function onSearchKeyDown(event) {
    if (event.key !== "Enter") return;
    const first = filtered
      .flatMap((entry) => entry.items)
      .find((tool) => tool.available);
    if (first) {
      setMenuOpen(false);
      setQuery("");
      navigate(`/${first.slug}`);
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-borderDark bg-panel">
      {/* Midnight Orange spec: Ink Black #0B0B0B, 56-64px, border #333333 */}
      <div className="mx-auto flex h-[60px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            aria-label="Dr.Docs home"
            className="flex items-center gap-2.5 rounded-[5px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-orange text-[19px] font-bold leading-none text-black">
              D
            </div>
            <span className="font-display text-[19px] font-bold leading-none tracking-tight text-content">
              Dr.Docs
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <div ref={menuRef} className="relative">
            {/* The header control is the search field itself: type here to
                filter the tool list, or open the menu with the chevron to
                browse every group. Nothing search-like lives in the panel. */}
            <div
              className={
                "flex items-center gap-2 rounded-[5px] border bg-deep px-2.5 py-2 transition " +
                (menuOpen
                  ? "border-orange ring-2 ring-orange/20"
                  : "border-borderStrong hover:border-[#666666]")
              }
            >
              <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded={menuOpen}
                aria-autocomplete="list"
                aria-controls="header-tools-menu"
                aria-label="Search PDF tools"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setMenuOpen(true);
                }}
                onFocus={() => setMenuOpen(true)}
                onKeyDown={onSearchKeyDown}
                placeholder="Search"
                className="w-24 bg-transparent font-body text-[13px] font-medium text-content outline-none placeholder:font-body placeholder:text-muted sm:w-44"
              />
              {/* The slash hint: the GitHub/Notion pattern - a small key
                  chip in the field, with the plain-words tooltip, gone once
                  the menu is open so it never competes with the query. */}
              {!menuOpen && (
                <span
                  aria-hidden="true"
                  title="Press / to search"
                  className="shrink-0 rounded-[4px] border border-borderDark bg-panel px-1.5 py-0.5 font-mono text-[10px] font-medium leading-[14px] text-muted"
                >
                  /
                </span>
              )}
              <button
                type="button"
                tabIndex={-1}
                aria-label="Open the PDF tools menu"
                onClick={() => {
                  setMenuOpen((open) => !open);
                  if (!menuOpen) inputRef.current?.focus();
                }}
                className="shrink-0"
              >
                <ChevronDown
                  className={"h-3.5 w-3.5 text-muted transition " + (menuOpen ? "rotate-180" : "")}
                />
              </button>
            </div>

            {menuOpen && (
              <div
                id="header-tools-menu"
                role="menu"
                className="absolute right-0 top-[calc(100%+8px)] z-40 max-h-[70vh] w-72 overflow-y-auto rounded-[6px] border border-borderStrong bg-panel p-2 shadow-lg"
              >
                {filtered.length === 0 && (
                  <p className="px-2 py-3 font-body text-[13px] leading-normal text-muted">
                    No tool for "{trimmed}". Try merge, rotate, compress or
                    unlock.
                  </p>
                )}

                {filtered.map(({ group, items }) => (
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
