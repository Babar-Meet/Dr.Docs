/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Inter", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        // Theme-aware via CSS variables - Midnight Orange is default, White and AMOLED override via [data-theme]
        ink: "var(--ink)",
        deep: "var(--deep)",
        panel: "var(--panel)",
        elevated: "var(--elevated)",
        borderDark: "var(--borderDark)",
        borderStrong: "var(--borderStrong)",
        offWhite: "var(--offWhite)",
        muted: "var(--muted)",
        orange: "var(--orange)",
        orangeDark: "var(--orangeDark)",
        orangeSoft: "var(--orangeSoft)",
        success: "var(--success)",
        successBg: "var(--successBg)",
        successText: "var(--successText)",
        warning: "var(--warning)",
        warningBg: "var(--warningBg)",
        warningText: "var(--warningText)",
        error: "var(--error)",
        errorBg: "var(--errorBg)",
        errorText: "var(--errorText)",
        info: "var(--info)",
        infoBg: "var(--infoBg)",
        infoText: "var(--infoText)",
      },
      boxShadow: {
        sm: "0 2px 6px rgba(0,0,0,0.25)",
        md: "0 6px 18px rgba(0,0,0,0.35)",
        lg: "0 12px 32px rgba(0,0,0,0.45)",
        panel: "0 6px 18px rgba(0,0,0,0.35)",
      },
      borderRadius: {
        sm: "3px",
        md: "5px",
        lg: "8px",
      },
    },
  },
  plugins: [],
};
