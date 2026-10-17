import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../theme/ThemeProvider.jsx";

// The one theme switch: midnight arms the flashbang (handled by the provider),
// white returns to midnight immediately.
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === "midnight" ? "Switch to Total White" : "Switch to Midnight Orange"}
      aria-label={theme === "midnight" ? "Switch to Total White" : "Switch to Midnight Orange"}
      aria-pressed={theme === "white"}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-borderDark bg-panel text-muted transition hover:bg-elevated hover:text-content"
    >
      {theme === "midnight" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
