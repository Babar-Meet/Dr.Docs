import { createContext, useContext, useEffect, useRef, useState } from "react";

const THEMES = [
  { value: "midnight", label: "Midnight", title: "Dark theme" },
  { value: "white", label: "White", title: "Light theme" },
];

function getInitialTheme() {
  try {
    const saved = localStorage.getItem("dr-docs-theme");
    if (saved && THEMES.some((t) => t.value === saved)) return saved;
  } catch {}
  return "midnight";
}

const ThemeContext = createContext(null);

export function useTheme() {
  return useContext(ThemeContext);
}

// Owns the theme value, its persistence, and the flashbang state machine that
// guards the midnight to white transition. Renders nothing but children: the
// overlay itself is mounted by SiteLayout and reads state through this context.
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => getInitialTheme());
  const [showFlashbang, setShowFlashbang] = useState(false);
  const [flashCountdown, setFlashCountdown] = useState(5);
  const flashTimerRef = useRef(null);

  // theme effect - apply data-theme and persist
  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("dr-docs-theme", theme);
    } catch {}
  }, [theme]);

  // flashbang countdown - only for midnight -> white transition, 5 sec, funny, skipable
  useEffect(() => {
    if (!showFlashbang) return;
    if (flashCountdown <= 0) {
      setTheme("white");
      setShowFlashbang(false);
      setFlashCountdown(5);
      return;
    }
    flashTimerRef.current = setTimeout(() => setFlashCountdown((c) => c - 1), 1000);
    return () => clearTimeout(flashTimerRef.current);
  }, [showFlashbang, flashCountdown]);

  function toggleTheme() {
    const next = theme === "midnight" ? "white" : "midnight";
    // only flash when going DARK -> LIGHT, not light -> dark, not on reload
    if (theme === "midnight" && next === "white") {
      setFlashCountdown(5);
      setShowFlashbang(true);
      return;
    }
    setTheme(next);
  }

  function requestWhite() {
    clearTimeout(flashTimerRef.current);
    setTheme("white");
    setShowFlashbang(false);
    setFlashCountdown(5);
  }

  function cancelFlashbang() {
    clearTimeout(flashTimerRef.current);
    setShowFlashbang(false);
    setFlashCountdown(5);
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        requestWhite,
        showFlashbang,
        flashCountdown,
        cancelFlashbang,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
