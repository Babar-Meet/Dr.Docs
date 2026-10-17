import { NavLink } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import ThemeToggle from "./ThemeToggle.jsx";
import { useTheme } from "../../theme/ThemeProvider.jsx";
import { GENERIC_CONVERT, liveTools } from "../../lib/toolConfig";

const RAIL_ITEMS = [
  ...liveTools().map((tool) => ({
    key: tool.slug,
    to: `/${tool.slug}`,
    label: tool.label,
    icon: tool.icon,
    title: tool.help,
    end: false,
  })),
  // The generic convert hub is exported separately because it is not a ledger
  // row in TOOLS; it is appended to the rail explicitly.
  {
    key: GENERIC_CONVERT.slug,
    to: `/${GENERIC_CONVERT.slug}`,
    label: GENERIC_CONVERT.label,
    icon: GENERIC_CONVERT.icon,
    title: GENERIC_CONVERT.help,
    end: false,
  },
  {
    key: "all-tools",
    to: "/",
    label: "All tools",
    icon: LayoutGrid,
    title: "All tools",
    // Without `end` a NavLink to "/" would be active on every route.
    end: true,
  },
];

export default function Header() {
  const { theme } = useTheme();

  return (
    <header className="sticky top-0 z-30 border-b border-borderDark bg-ink">
      {/* Top Navigation - Midnight Orange spec: Ink Black #0B0B0B, 56-64px, border #333333 */}
      <div className="mx-auto flex h-[60px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-[5px] bg-orange text-sm font-bold text-black">
            D
          </div>
          <div>
            <p className="font-display text-[15px] font-bold leading-none tracking-tight text-white">
              Dr.Docs
            </p>
            <p className="font-mono text-[11px] font-normal leading-none text-muted">
              {theme === "white" ? "TOTAL WHITE" : "MIDNIGHT ORANGE"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>

      {/* Tool Navigation - tabs style */}
      <div className="border-t border-borderDark bg-ink">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav
            aria-label="Tools"
            className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-thin"
          >
            {RAIL_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.key}
                  to={item.to}
                  end={item.end}
                  title={item.title}
                  className={({ isActive }) =>
                    "inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] font-bold leading-none transition " +
                    (isActive
                      ? "border-orange bg-panel text-orange"
                      : "border-transparent text-muted hover:bg-panel hover:text-white")
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
